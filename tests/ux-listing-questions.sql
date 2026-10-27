-- Effortless Laria, batch "listing", big-11 (docs/ux-effortless/listing.md): public questions on a listing.
-- Asking, the contact-detail filter, the limits, answering once, the seller's notification and e-mail, the asker's
-- notification, reporting a question, admin hide/restore, and the browser-role boundaries. Local/test database only.
-- Every fixture is rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) > 0 then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;

create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('qa.' || p_name)::uuid $$;
create function pg_temp.remember(p_name text, p_id uuid) returns void language plpgsql as $$
begin perform set_config('qa.' || p_name, p_id::text, true); end $$;

create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id('admin'), 'role', 'authenticated',
    'aal', 'aal2', 'app_metadata', jsonb_build_object('role', 'admin'))::text, true);
end $$;
-- Reads that the browser roles cannot make (the table is closed to them).
create function pg_temp.question(p_id uuid) returns public.listing_questions language sql security definer as $$
  select * from public.listing_questions where id = p_id
$$;
create function pg_temp.notifications(p_user uuid, p_type text) returns bigint language sql security definer as $$
  select count(*) from public.notifications where user_id = p_user and event_type = p_type
$$;
create function pg_temp.deliveries(p_key text) returns bigint language sql security definer as $$
  select count(*) from laria_private.marketplace_email_deliveries where dedupe_key = p_key
$$;
create function pg_temp.ask(p_listing text, p_body text) returns uuid language sql as $$
  select (public.ask_listing_question(pg_temp.id(p_listing), p_body)->>'id')::uuid
$$;
create function pg_temp.ids(p_page jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((value->>'id')::uuid), '{}') from jsonb_array_elements(p_page->'questions')
$$;

select pg_temp.remember('seller', 'e5110000-0000-4000-8000-000000000001'),
       pg_temp.remember('buyer', 'e5110000-0000-4000-8000-000000000002'),
       pg_temp.remember('buyer2', 'e5110000-0000-4000-8000-000000000003'),
       pg_temp.remember('owner', 'e5110000-0000-4000-8000-000000000004'),
       pg_temp.remember('admin', 'e5110000-0000-4000-8000-000000000099'),
       pg_temp.remember('store', 'e6110000-0000-4000-8000-000000000001'),
       pg_temp.remember('l_ind', 'e7110000-0000-4000-8000-000000000001'),
       pg_temp.remember('l_store', 'e7110000-0000-4000-8000-000000000002'),
       pg_temp.remember('l_sold', 'e7110000-0000-4000-8000-000000000003'),
       pg_temp.remember('l_pending', 'e7110000-0000-4000-8000-000000000004');

-- ------------------------------------------------------------------ fixtures

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('e5110000-0000-4000-8000-000000000001','authenticated','authenticated','qna-seller@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Vera Vendedora","phone":"51999995101","city":"Lima","region":"Lima"}'),
 ('e5110000-0000-4000-8000-000000000002','authenticated','authenticated','qna-buyer@example.invalid',now(),'{}','{"account_type":"seller","full_name":"rodrigo  castañeda ruiz","phone":"51999995102","city":"Lima","region":"Lima"}'),
 ('e5110000-0000-4000-8000-000000000003','authenticated','authenticated','qna-buyer2@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Lucía","phone":"51999995103","city":"Lima","region":"Lima"}'),
 ('e5110000-0000-4000-8000-000000000004','authenticated','authenticated','qna-owner@example.invalid',now(),'{}','{"account_type":"store_owner","full_name":"Dueño Tienda Q","phone":"51999995104","city":"Lima","region":"Lima"}'),
 ('e5110000-0000-4000-8000-000000000099','authenticated','authenticated','qna-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin Q","phone":"51999995199","city":"Lima","region":"Lima"}');

insert into public.stores (id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values
 ('e6110000-0000-4000-8000-000000000001','qna-tienda','Tienda Q','Tienda Q SAC','20999995111','qna-t@example.invalid','Contacto Q','Contacto Q','51999995104','Lima','Lima','Av. QA 11','e5110000-0000-4000-8000-000000000004','active','free',true);

insert into public.listings (id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at,sold_at) values
 ('e7110000-0000-4000-8000-000000000001','qna-ind','Guitarra Q particular','individual','approved','guitars','electric_guitar','QA','Uno','Usado - buen estado',1200,'Lima','Lima','Vera','51999995101','Descripción de prueba válida con más de cuarenta caracteres.','e5110000-0000-4000-8000-000000000001',null,'self_service',now(),null),
 ('e7110000-0000-4000-8000-000000000002','qna-store','Pedal Q tienda','store','approved','pedals','pedals','QA','Dos','Nuevo',300,'Lima','Lima','Contacto Q','51999995104','Descripción de prueba válida con más de cuarenta caracteres.','e5110000-0000-4000-8000-000000000004','e6110000-0000-4000-8000-000000000001','self_service',now(),null),
 ('e7110000-0000-4000-8000-000000000003','qna-sold','Bajo Q vendido','individual','sold','basses','bass','QA','Tres','Usado - buen estado',900,'Lima','Lima','Vera','51999995101','Descripción de prueba válida con más de cuarenta caracteres.','e5110000-0000-4000-8000-000000000001',null,'self_service',now(),now()),
 ('e7110000-0000-4000-8000-000000000004','qna-pending','Batería Q en revisión','individual','pending','drums','drum_kit','QA','Cuatro','Usado - buen estado',2000,'Lima','Lima','Vera','51999995101','Descripción de prueba válida con más de cuarenta caracteres.','e5110000-0000-4000-8000-000000000001',null,'self_service',now(),null);

-- A question asked while the bass was still published, answered before it sold.
insert into public.listing_questions(id, listing_id, asker_user_id, body, answer, answered_at, answered_by)
values ('e8110000-0000-4000-8000-000000000001', pg_temp.id('l_sold'), pg_temp.id('buyer2'), '¿Tiene estuche?', 'Sí, incluye estuche.', now(), pg_temp.id('seller'));

-- ------------------------------------------------------------------ anonymous visitors read, never write

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare page jsonb := public.get_listing_questions(pg_temp.id('l_ind'));
begin
  perform pg_temp.check(page->'questions' = '[]'::jsonb, 'no questions yet');
  perform pg_temp.check((page->>'signed_in')::boolean = false and (page->>'can_ask')::boolean = false
    and (page->>'can_answer')::boolean = false and (page->>'accepting')::boolean = true, 'anon flags');
  perform pg_temp.expect_error($q$select public.ask_listing_question('e7110000-0000-4000-8000-000000000001', '¿Tiene estuche?')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.answer_listing_question('e8110000-0000-4000-8000-000000000001', 'Sí')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select public.hide_listing_question('e8110000-0000-4000-8000-000000000001', 'Spam claro')$q$, 'permission denied');
  perform pg_temp.expect_error('select count(*) from public.listing_questions', 'permission denied');
  -- A pending listing shows nothing.
  perform pg_temp.check(public.get_listing_questions(pg_temp.id('l_pending'))->'questions' = '[]'::jsonb, 'pending listing hidden');
end $$;
reset role;

-- ------------------------------------------------------------------ asking

set local role authenticated;
select pg_temp.as_user('buyer');
do $$
declare q uuid; page jsonb;
begin
  -- The flags for a signed-in buyer.
  page := public.get_listing_questions(pg_temp.id('l_ind'));
  perform pg_temp.check((page->>'can_ask')::boolean and not (page->>'can_answer')::boolean and not (page->>'is_admin')::boolean, 'buyer flags');

  -- Length.
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', ' Hola ')$q$, 'QUESTION_LENGTH: ');
  perform pg_temp.expect_error(format('select pg_temp.ask(%L, %L)', 'l_ind', repeat('a', 301)), 'QUESTION_LENGTH');

  -- The PAY-1 contact-detail filter: phone numbers however spaced, links, e-mails.
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', '¿Me escribes al 987 654 321?')$q$, 'QUESTION_CONTACT_DETAILS: No escribas');
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', 'Llámame: 987.654-321 por favor')$q$, 'QUESTION_CONTACT_DETAILS');
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', 'Mira https://ejemplo.org/x')$q$, 'QUESTION_CONTACT_DETAILS');
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', 'Mira www.ejemplo.pe ahora')$q$, 'QUESTION_CONTACT_DETAILS');
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', 'Escríbeme a ana@correo.com')$q$, 'QUESTION_CONTACT_DETAILS');

  -- Not on unpublished or sold listings.
  perform pg_temp.expect_error($q$select pg_temp.ask('l_pending', '¿Tiene estuche?')$q$, 'QUESTION_LISTING_UNAVAILABLE');
  perform pg_temp.expect_error($q$select pg_temp.ask('l_sold', '¿Tiene estuche?')$q$, 'QUESTION_LISTING_UNAVAILABLE');

  -- A clean question shows at once, whitespace folded.
  q := pg_temp.ask('l_ind', '  ¿Tiene 2 pastillas   y 22 trastes?  ');
  perform pg_temp.remember('q1', q);
  perform pg_temp.check((pg_temp.question(q)).body = '¿Tiene 2 pastillas y 22 trastes?', 'body normalized');
  page := public.get_listing_questions(pg_temp.id('l_ind'));
  perform pg_temp.check(pg_temp.ids(page) = array[q], 'visible at once');
  perform pg_temp.check(page->'questions'->0->>'asker_name' = 'rodrigo C.', 'first name + initial');
  perform pg_temp.check((page->'questions'->0->>'is_mine')::boolean, 'is_mine');
  perform pg_temp.check(position('castañeda' in page::text) = 0, 'no full name leaks');
end $$;

-- The seller hears about it: one in-app notification and one queued e-mail keyed by the question.
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('seller'), 'listing_question_asked') = 1, 'seller notified in app');
  perform pg_temp.check(pg_temp.deliveries('listing_question:' || pg_temp.id('q1')) = 1, 'seller e-mail queued');
  perform pg_temp.check(exists (
    select 1 from laria_private.marketplace_email_deliveries d
    join public.notifications n on n.id = d.notification_id
    where d.dedupe_key = 'listing_question:' || pg_temp.id('q1') and d.event_type = 'listing_question_asked'
      and d.recipient_user_id = pg_temp.id('seller') and d.listing_id = pg_temp.id('l_ind')
      and n.message like 'Te preguntaron en “Guitarra Q particular”: “¿Tiene 2 pastillas%'
  ), 'delivery row wired to the notification');
  -- Only one e-mail per question: the notifications trigger does not queue a second one.
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = pg_temp.id('seller')) = 1, 'one e-mail');
end $$;

-- Limits: 3 unanswered per listing, then 20 a day.
set local role authenticated;
select pg_temp.as_user('buyer');
do $$ begin
  perform pg_temp.remember('q2', pg_temp.ask('l_ind', '¿Cuánto pesa?'));
  perform pg_temp.remember('q3', pg_temp.ask('l_ind', '¿Es de 2019?'));
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', '¿Tiene golpes?')$q$, 'QUESTION_PENDING_LIMIT');
  -- Another listing is a separate count.
  perform pg_temp.remember('q_store', pg_temp.ask('l_store', '¿Tiene caja original?'));
end $$;

-- The seller can't ask on their own listing.
select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', '¿Sigue disponible?')$q$, 'QUESTION_OWN_LISTING');
  perform pg_temp.check((public.get_listing_questions(pg_temp.id('l_ind'))->>'can_ask')::boolean = false, 'seller cannot ask');
  perform pg_temp.check((public.get_listing_questions(pg_temp.id('l_ind'))->>'can_answer')::boolean, 'seller can answer');
end $$;
select pg_temp.as_user('owner');
do $$ begin
  perform pg_temp.expect_error($q$select pg_temp.ask('l_store', '¿Sigue disponible?')$q$, 'QUESTION_OWN_LISTING');
end $$;

-- 20 a day: buyer2 already asked 20 (answered) questions in the last hours.
reset role;
insert into public.listing_questions(listing_id, asker_user_id, body, answer, answered_at, created_at)
select pg_temp.id('l_store'), pg_temp.id('buyer2'), '¿Pregunta número ' || n || '?', 'Respuesta.', now(), now() - interval '1 hour'
from generate_series(1, 20) n;
set local role authenticated;
select pg_temp.as_user('buyer2');
do $$ begin
  perform pg_temp.expect_error($q$select pg_temp.ask('l_ind', '¿Sigue disponible?')$q$, 'QUESTION_DAILY_LIMIT');
end $$;
reset role;
update public.listing_questions set created_at = now() - interval '25 hours' where asker_user_id = pg_temp.id('buyer2') and listing_id = pg_temp.id('l_store');
set local role authenticated;
select pg_temp.as_user('buyer2');
do $$ begin
  perform pg_temp.remember('q_b2', pg_temp.ask('l_ind', '¿Sigue disponible?'));
end $$;

-- ------------------------------------------------------------------ answering

do $$ begin
  -- Not the seller: neither another buyer nor the asker.
  perform pg_temp.expect_error(format('select public.answer_listing_question(%L, %L)', pg_temp.id('q1'), 'Sí, dos.'), 'QUESTION_ANSWER_FORBIDDEN');
end $$;
select pg_temp.as_user('buyer');
do $$ begin
  perform pg_temp.expect_error(format('select public.answer_listing_question(%L, %L)', pg_temp.id('q1'), 'Sí, dos.'), 'QUESTION_ANSWER_FORBIDDEN');
end $$;
select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error(format('select public.answer_listing_question(%L, %L)', pg_temp.id('q1'), 'Sí, dos.'), 'QUESTION_ANSWER_FORBIDDEN');
end $$;

select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.expect_error(format('select public.answer_listing_question(%L, %L)', pg_temp.id('q1'), 'x'), 'QUESTION_ANSWER_LENGTH');
  perform pg_temp.expect_error(format('select public.answer_listing_question(%L, %L)', pg_temp.id('q1'), 'Escríbeme al 999 888 777'), 'QUESTION_CONTACT_DETAILS');
  perform public.answer_listing_question(pg_temp.id('q1'), 'Sí, dos humbuckers y 22 trastes.');
  perform pg_temp.check((pg_temp.question(pg_temp.id('q1'))).answer = 'Sí, dos humbuckers y 22 trastes.', 'answer saved');
  perform pg_temp.check((pg_temp.question(pg_temp.id('q1'))).answered_by = pg_temp.id('seller'), 'answered_by');
  -- Once.
  perform pg_temp.expect_error(format('select public.answer_listing_question(%L, %L)', pg_temp.id('q1'), 'Otra vez'), 'QUESTION_ALREADY_ANSWERED');
  -- Every later visitor sees it.
  perform pg_temp.check(public.get_listing_questions(pg_temp.id('l_ind'))->'questions'->-1->>'answer' = 'Sí, dos humbuckers y 22 trastes.', 'answer shown');
end $$;

-- The store owner answers the store listing's questions.
select pg_temp.as_user('owner');
do $$ begin
  perform pg_temp.check((public.get_listing_questions(pg_temp.id('l_store'))->>'can_answer')::boolean, 'store owner can answer');
  perform public.answer_listing_question(pg_temp.id('q_store'), 'Sí, con su caja.');
end $$;

-- The asker is told in the app, never by e-mail; with one answered, the buyer may ask again.
reset role;
do $$ begin
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('buyer'), 'listing_question_answered') = 2, 'asker notified twice');
  perform pg_temp.check(pg_temp.notifications(pg_temp.id('owner'), 'listing_question_asked') = 1, 'store owner notified of the store question');
  perform pg_temp.check((select count(*) from laria_private.marketplace_email_deliveries where recipient_user_id = pg_temp.id('buyer')) = 0, 'no e-mail to the asker');
end $$;
set local role authenticated;
select pg_temp.as_user('buyer');
do $$ begin
  perform pg_temp.remember('q4', pg_temp.ask('l_ind', '¿Tiene golpes?'));
end $$;

-- ------------------------------------------------------------------ sold listings: read-only

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare page jsonb := public.get_listing_questions(pg_temp.id('l_sold'));
begin
  perform pg_temp.check(jsonb_array_length(page->'questions') = 1 and (page->>'accepting')::boolean = false, 'sold Q&A shown, closed');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.check((public.get_listing_questions(pg_temp.id('l_sold'))->>'can_answer')::boolean = false, 'no answers on sold');
end $$;

-- ------------------------------------------------------------------ reporting

select pg_temp.as_user('buyer2');
do $$
declare report uuid;
begin
  report := public.submit_content_report('question', pg_temp.id('q1'), 'spam', 'Pregunta repetida');
  perform pg_temp.expect_error(format('select public.submit_content_report(%L, %L, %L)', 'question', pg_temp.id('q1'), 'spam'), 'REPORT_ALREADY_SUBMITTED');
  perform pg_temp.remember('report', report);
end $$;
select pg_temp.as_user('buyer');
do $$ begin
  -- Not one's own question.
  perform pg_temp.expect_error(format('select public.submit_content_report(%L, %L, %L)', 'question', pg_temp.id('q1'), 'spam'), 'REPORT_TARGET_UNAVAILABLE');
end $$;
select pg_temp.as_user('seller');
do $$ begin
  -- The seller may report a question on their listing; listings and reviews keep working as before.
  perform public.submit_content_report('question', pg_temp.id('q2'), 'acoso', null);
end $$;
reset role;
do $$ begin
  perform pg_temp.check(exists (select 1 from public.reports where id = pg_temp.id('report') and target_type = 'question'
    and question_id = pg_temp.id('q1') and listing_id is null and store_id is null and review_id is null), 'question report row');
  perform pg_temp.expect_error(format('insert into public.reports(reporter_user_id, target_type, listing_id, question_id, reason) values (%L, %L, %L, %L, %L)',
    pg_temp.id('buyer'), 'listing', pg_temp.id('l_ind'), pg_temp.id('q1'), 'spam'), 'reports_question_target_check');
end $$;

-- ------------------------------------------------------------------ admin hide / restore

set local role authenticated;
select pg_temp.as_user('seller');
do $$ begin
  -- The seller cannot hide or delete.
  perform pg_temp.expect_error(format('select public.hide_listing_question(%L, %L)', pg_temp.id('q1'), 'No me gusta'), 'QUESTION_ADMIN_REQUIRED');
  perform pg_temp.expect_error(format('delete from public.listing_questions where id = %L', pg_temp.id('q1')), 'permission denied');
end $$;
select pg_temp.as_user('buyer');
do $$ begin
  -- The asker cannot edit.
  perform pg_temp.expect_error(format('update public.listing_questions set body = %L where id = %L', 'Editada', pg_temp.id('q1')), 'permission denied');
  perform pg_temp.expect_error(format('insert into public.listing_questions(listing_id, asker_user_id, body) values (%L, %L, %L)',
    pg_temp.id('l_ind'), pg_temp.id('buyer'), 'Directa a la tabla'), 'permission denied');
end $$;

select pg_temp.as_admin();
do $$
declare page jsonb;
begin
  perform pg_temp.expect_error(format('select public.hide_listing_question(%L, %L)', pg_temp.id('q1'), ' '), 'QUESTION_REASON_REQUIRED');
  perform public.hide_listing_question(pg_temp.id('q1'), 'Contenido repetido');
  perform pg_temp.expect_error(format('select public.hide_listing_question(%L, %L)', pg_temp.id('q1'), 'Otra vez'), 'QUESTION_STATUS_UNCHANGED');
  -- The admin still sees it, marked, with the reason.
  page := public.get_listing_questions(pg_temp.id('l_ind'));
  perform pg_temp.check((page->>'is_admin')::boolean, 'admin flag');
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(page->'questions') q
    where q->>'id' = pg_temp.id('q1')::text and q->>'status' = 'hidden' and q->>'hidden_reason' = 'Contenido repetido'), 'admin sees hidden');
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.check(not (pg_temp.id('q1') = any(pg_temp.ids(public.get_listing_questions(pg_temp.id('l_ind'))))), 'hidden gone publicly');
  perform pg_temp.check(position('Contenido repetido' in public.get_listing_questions(pg_temp.id('l_ind'))::text) = 0, 'reason not public');
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('seller');
do $$ begin
  -- Hiding one question leaves the others answerable.
  perform public.answer_listing_question(pg_temp.id('q2'), 'Pesa 3 kilos.');
end $$;
-- A hidden question can't be answered or reported.
reset role;
update public.listing_questions set answer = null, answered_at = null where id = pg_temp.id('q1');
set local role authenticated;
select pg_temp.as_user('seller');
do $$ begin
  perform pg_temp.expect_error(format('select public.answer_listing_question(%L, %L)', pg_temp.id('q1'), 'Sí'), 'QUESTION_NOT_FOUND');
end $$;
select pg_temp.as_user('owner');
do $$ begin
  perform pg_temp.expect_error(format('select public.submit_content_report(%L, %L, %L)', 'question', pg_temp.id('q1'), 'otro'), 'REPORT_TARGET_UNAVAILABLE');
end $$;

select pg_temp.as_admin();
do $$ begin
  perform pg_temp.expect_error(format('select public.restore_listing_question(%L, %L)', pg_temp.id('q2'), 'Revisada'), 'QUESTION_STATUS_UNCHANGED');
  perform public.restore_listing_question(pg_temp.id('q1'), 'Revisada de nuevo');
end $$;
reset role;
do $$ begin
  perform pg_temp.check((pg_temp.question(pg_temp.id('q1'))).status = 'visible' and (pg_temp.question(pg_temp.id('q1'))).hidden_reason is null, 'restored');
  perform pg_temp.check((select count(*) from public.admin_audit_actions where target_type = 'question' and target_id = pg_temp.id('q1')
    and action in ('question_hidden', 'question_restored')) = 2, 'audit rows');
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform pg_temp.check(pg_temp.id('q1') = any(pg_temp.ids(public.get_listing_questions(pg_temp.id('l_ind')))), 'visible again');
  -- Newest first.
  perform pg_temp.check((pg_temp.ids(public.get_listing_questions(pg_temp.id('l_ind'))))[1] = pg_temp.id('q4'), 'newest first');
end $$;

rollback;
