-- Launch audit A13 (supabase/migrations/20261114170000_launch_audit_monitoring.sql): server and browser errors are
-- counted per kind and 10 minutes without anything that identifies a person, capped per bucket, listed for an aal2
-- Admin, summed for /api/health and kept 30 days. Local/test database only. Every fixture is rolled back.
begin;

create function pg_temp.check(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'FAILED: %', p_message; end if;
end $$;
create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) > 0 or sqlstate = p_code then return; end if;
    raise exception 'Expected % from [%], got: % (%)', p_code, p_sql, sqlerrm, sqlstate;
  end;
  raise exception 'Expected % from [%], but it succeeded', p_code, p_sql;
end $$;
create function pg_temp.claims(p_sub text, p_admin boolean, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal,
    'app_metadata', case when p_admin then jsonb_build_object('role', 'admin') else '{}'::jsonb end)::text, true)
$$;
create function pg_temp.bucket(p_at timestamptz) returns timestamptz language sql immutable as $$
  select date_bin(interval '10 minutes', p_at, timestamptz '2001-01-01 00:00:00+00')
$$;
grant execute on function pg_temp.check(boolean, text), pg_temp.expect_error(text, text),
  pg_temp.claims(text, boolean, text), pg_temp.bucket(timestamptz) to anon, authenticated, service_role;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
 ('a1300000-0000-4000-8000-000000000001','authenticated','authenticated','la13-uno@example.invalid',now(),'{}','{"account_type":"seller","full_name":"Persona A13","phone":"51999991301","city":"Lima","region":"Lima"}'),
 ('a1300000-0000-4000-8000-000000000002','authenticated','authenticated','la13-admin@example.invalid',now(),'{"role":"admin"}','{"account_type":"seller","full_name":"Admin A13","phone":"51999991302","city":"Lima","region":"Lima"}');

delete from laria_private.app_errors where true;
-- Every count below must land in one 10-minute bucket: wait out a boundary that is less than 20 seconds away.
do $$ begin
  if pg_temp.bucket(clock_timestamp()) + interval '10 minutes' - clock_timestamp() < interval '20 seconds' then
    perform pg_sleep(21);
  end if;
end $$;

-- ------------------------------------------------------------------ who may do what

do $$ begin
  perform pg_temp.check(has_function_privilege('service_role', 'public.record_app_error(text, text, text, text, text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.record_app_error(text, text, text, text, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_app_error(text, text, text, text, text, text, text)', 'execute'),
    'only the service role counts errors');
  perform pg_temp.check(has_function_privilege('service_role', 'public.get_app_health()', 'execute')
    and not has_function_privilege('anon', 'public.get_app_health()', 'execute')
    and not has_function_privilege('authenticated', 'public.get_app_health()', 'execute'), 'only the service role reads the health');
  perform pg_temp.check(has_function_privilege('authenticated', 'public.get_admin_app_errors(integer, text)', 'execute')
    and not has_function_privilege('anon', 'public.get_admin_app_errors(integer, text)', 'execute'), 'signed-in calls reach the Admin check');
  perform pg_temp.check(not has_function_privilege('authenticated', 'laria_private.scrub_error_text(text)', 'execute')
    and not has_function_privilege('authenticated', 'laria_private.app_error_route(text, text)', 'execute')
    and not has_function_privilege('authenticated', 'laria_private.app_error_name(text, text)', 'execute')
    and not has_function_privilege('authenticated', 'laria_private.app_error_route_patterns()', 'execute')
    and not has_function_privilege('authenticated', 'laria_private.app_error_browser_messages()', 'execute')
    and not has_function_privilege('anon', 'laria_private.app_error_browser_message(text)', 'execute')
    and not has_function_privilege('authenticated', 'laria_private.run_app_error_retention()', 'execute')
    and not has_function_privilege('anon', 'laria_private.run_app_error_retention()', 'execute'), 'the helpers stay private');
  perform pg_temp.check(not has_table_privilege('anon', 'laria_private.app_errors', 'select')
    and not has_table_privilege('authenticated', 'laria_private.app_errors', 'select')
    and not has_table_privilege('authenticated', 'laria_private.app_errors', 'insert'), 'no API role reads or writes the counts');
  perform pg_temp.check((select relrowsecurity from pg_class where oid = 'laria_private.app_errors'::regclass), 'RLS is on');
  perform pg_temp.check(exists (select 1 from cron.job where jobname = 'app-error-retention' and schedule = '50 9 * * *'
    and command = 'select laria_private.run_app_error_retention()'), 'the retention job runs daily at 09:50 UTC');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error('select public.record_app_error(''browser'', ''error'', ''/'', ''Error'', ''x'')', '42501');
select pg_temp.expect_error('select public.get_app_health()', '42501');
select pg_temp.expect_error('select public.get_admin_app_errors(7, null)', '42501');
reset role;

-- ------------------------------------------------------------------ what is kept

do $$ declare scrubbed text; begin
  scrubbed := laria_private.scrub_error_text('No account for ana.perez+ventas@gmail.com on listing 3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b');
  perform pg_temp.check(scrubbed = 'No account for <email> on listing <id>', 'addresses and ids are replaced: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk failed');
  perform pg_temp.check(scrubbed !~ 'eyJ|dBjft' and scrubbed ~ '<token>', 'tokens are replaced: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('WhatsApp +51 987 654 321, DNI 45678912, RUC 20123456789 from 190.42.17.3');
  perform pg_temp.check(scrubbed = 'WhatsApp <n>, DNI <n>, RUC <n> from <n>', 'phone, DNI, RUC and IP numbers are replaced: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('GET /listados?q=juan%20perez&page=2 failed; https://laria.audio/vender#access_token=abc.def-123 too');
  perform pg_temp.check(scrubbed = 'GET /listados?… failed; https://laria.audio/… too', 'query strings and fragments go: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('Cannot read properties of undefined (reading ''getBoundingClientRect''), status 500 at line 42');
  perform pg_temp.check(scrubbed = 'Cannot read properties of undefined (reading ''…''), status 500 at line 42',
    'ordinary words and short numbers stay, quoted text goes: ' || scrubbed);
  perform pg_temp.check(laria_private.scrub_error_text(null) = '', 'nothing is an empty text');
  -- Numbers written with no-break spaces, thin spaces or Unicode dashes are still numbers.
  scrubbed := laria_private.scrub_error_text('Llamar al +51' || chr(160) || '987' || chr(160) || '654' || chr(160) || '321, al 987'
    || chr(8209) || '654' || chr(8209) || '321 o al 987' || chr(8239) || '654' || chr(8239) || '321');
  perform pg_temp.check(scrubbed = 'Llamar al <n>, al <n> o al <n>', 'unusual spaces and dashes: ' || scrubbed);
  -- A web address keeps its scheme, and its host only when that is one of the services Laria uses: no user, password,
  -- path or query.
  scrubbed := laria_private.scrub_error_text('fetch https://ana:secreto@api.example.com:8443/v1/users/ana-perez?id=5 failed, see https://laria.audio');
  perform pg_temp.check(scrubbed = 'fetch https://<host>/… failed, see https://laria.audio', 'addresses lose credentials and paths: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('see https://ana-perez.example.com/path and https://hswk.supabase.co/rest/v1/listings?id=eq.5');
  perform pg_temp.check(scrubbed = 'see https://<host>/… and https://hswk.supabase.co/…', 'only the services'' hosts stay: ' || scrubbed);
  -- A JSON web token with no digit in it, and any long run of letters.
  scrubbed := laria_private.scrub_error_text('token eyJhbGciOiJFUyJ.eyJzdWIiOiJhbmEifQ.SigNaTuReOnLy rejected; session abcdefghijklmnopqrstuvwxyzABCDEFGH expired');
  perform pg_temp.check(scrubbed = 'token <token> rejected; session <token> expired', 'tokens without digits: ' || scrubbed);
  -- Names: after a colon, in a path, in quotes.
  scrubbed := laria_private.scrub_error_text('Invalid name: Ana Perez');
  perform pg_temp.check(scrubbed = 'Invalid name: …', 'what follows a colon goes: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('No store at /tiendas/ana-perez (or /api/stores/ana-perez/photos) for now');
  perform pg_temp.check(scrubbed = 'No store at /tiendas/… (or /api/…) for now', 'paths keep their first segment: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('Unexpected token ''A'', "Ana Perez" is not valid JSON, nor «Ana Pérez», “Ana”, ‘Ana’ or `Ana`');
  perform pg_temp.check(scrubbed = 'Unexpected token ''…'', "…" is not valid JSON, nor «…», “…”, ‘…’ or `…`', 'quoted text goes: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('Can''t load the seller''s page');
  perform pg_temp.check(scrubbed = 'Can''t load the seller''s page', 'apostrophes stay: ' || scrubbed);
  -- The second review's examples: numbers split by tabs or line breaks or written in fullwidth digits, e-mail
  -- addresses percent-encoded or in other scripts, credentials, IPv6 addresses and corner brackets.
  scrubbed := laria_private.scrub_error_text('WhatsApp +51' || chr(9) || '987' || chr(9) || '654' || chr(9) || '321, +51 987'
    || chr(10) || '654 321, DNI 1234' || chr(9) || '5678 o ４５６７８９１２');
  perform pg_temp.check(scrubbed = 'WhatsApp <n>, <n>, DNI <n> o <n>', 'tabs, line breaks and fullwidth digits: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('Correo ana%40example%2Ecom o 阿娜@例子.公司, not @supabase/ssr');
  perform pg_temp.check(scrubbed = 'Correo <email> o <email>, not @supabase/ssr', 'encoded and non-Latin e-mail addresses: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('Bearer QW5hIFBlcmV6 rejected, login password=huntertwo failed, connect abcd:ef::beef refused');
  perform pg_temp.check(scrubbed = 'Bearer … rejected, login password=… failed, connect <ip> refused', 'credentials and IPv6: ' || scrubbed);
  scrubbed := laria_private.scrub_error_text('「Ana Pérez」 not found');
  perform pg_temp.check(scrubbed = '「…」 not found', 'corner brackets: ' || scrubbed);
end $$;

-- A browser's message is kept only as one of laria_private.app_error_browser_messages(), never as written.
do $$ declare
  sample record;
  kept text;
begin
  -- The second review's examples, and other made-up text, read as no known message.
  for sample in select * from (values ('Ana Perez: invalid name'), ('WhatsApp +51' || chr(9) || '987' || chr(9) || '654' || chr(9) || '321'),
      ('DNI 1234' || chr(9) || '5678'), ('Correo ana%40example%2Ecom'), ('Correo 阿娜@例子.公司'), ('Bearer QW5hIFBlcmV6'),
      ('password=huntertwo'), ('Av. Arequipa 1234, Lima'), ('connect abcd:ef::beef'), ('「Ana Pérez」'),
      ('https://ana-perez.example.com/path'), ('Invalid name: Ana Perez'), ('[object AnaPerez]'), ('Tu sesión venció')) as t(message)
  loop
    kept := laria_private.app_error_browser_message(sample.message);
    perform pg_temp.check(kept = 'Otro mensaje (no se guarda el texto)', 'made-up text is not kept: ' || sample.message || ' read ' || kept);
  end loop;
  -- Known messages keep their wording and lose their values.
  for sample in select * from (values
      ('Cannot read properties of undefined (reading ''Ana Perez'')', 'Cannot read properties of undefined (reading ''…'')'),
      ('Uncaught TypeError: Cannot read properties of null (reading ''price'')', 'Cannot read properties of null (reading ''…'')'),
      ('Cannot read property ''price'' of null', 'Cannot read properties of null (reading ''…'')'),
      ('Loading chunk 4567 failed.' || chr(10) || '(error: https://laria.audio/_next/static/chunks/4567.js)', 'Loading chunk … failed.'),
      ('Minified React error #418; visit https://react.dev/errors/418?args[]=Ana%20Perez for the full message', 'Minified React error #418'),
      ('gtag is not defined', '… is not defined'),
      ('Can''t find variable: gtag', 'Can''t find variable: …'),
      ('undefined is not an object (evaluating ''window.ana.perez'')', 'undefined is not an object (evaluating ''…'')'),
      ('Unexpected token ''A'', "Ana Perez" is not valid JSON', '… is not valid JSON'),
      ('Failed to execute ''removeChild'' on ''Node'': The node to be removed is not a child of this node.',
        'Failed to execute ''removeChild'' on ''Node'': The node to be removed is not a child of this node.'),
      ('Failed to read the ''localStorage'' property from ''Window'': Access is denied for this document.',
        'Failed to read the ''localStorage'' property from ''Window'': …'),
      ('Failed to execute ''AnaPerez'' on ''Lima'': Ana', 'Failed to execute ''…'' on ''…'': …'),
      ('can''t access property "ana", perez is undefined', 'can''t access property …, … is undefined'),
      ('ana is null', '… is null'),
      ('NEXT_REDIRECT;replace;/login?next=/mi-cuenta;307;', 'NEXT_REDIRECT'),
      ('JWT expired (PGRST301)', 'JWT expired'),
      ('Failed to fetch dynamically imported module: https://laria.audio/x.js', 'Failed to fetch dynamically imported module: …'),
      ('[object Event]', '[object Event]'),
      ('Maximum call stack size exceeded', 'Maximum call stack size exceeded'),
      ('Unexpected identifier ''Ana''', 'Unexpected identifier'),
      ('', '(sin mensaje)')) as t(message, expected)
  loop
    kept := laria_private.app_error_browser_message(sample.message);
    perform pg_temp.check(kept = sample.expected, sample.message || ' read ' || kept);
    perform pg_temp.check(laria_private.app_error_browser_message(kept) = kept, kept || ' reads back as itself');
  end loop;
  perform pg_temp.check(laria_private.app_error_browser_message(null) = '(sin mensaje)', 'no message');
  -- Every message on the list reads back as itself, so the list is the whole of what can be kept.
  for sample in select * from laria_private.app_error_browser_messages() where message !~ '\\[12]' loop
    perform pg_temp.check(laria_private.app_error_browser_message(sample.message) = sample.message,
      sample.ordinal || ' reads back as itself: ' || sample.message);
  end loop;
  perform pg_temp.check((select count(*) > 80 and count(distinct ordinal) = count(*)
    from laria_private.app_error_browser_messages()), 'the list');
end $$;

-- Every route pattern reads as itself: a browser's address with values in its [params] and the server's route file.
do $$ declare
  pattern text;
  address text;
begin
  foreach pattern in array laria_private.app_error_route_patterns() loop
    address := regexp_replace(regexp_replace(regexp_replace(pattern, '\[\[\.\.\.[^]]+\]\]', 'a/b', 'g'),
      '\[\.\.\.[^]]+\]', 'a/b', 'g'), '\[[^]]+\]', 'muestra-1', 'g');
    perform pg_temp.check(laria_private.app_error_route('browser', address) = pattern, address || ' reads ' || pattern);
    perform pg_temp.check(laria_private.app_error_route('server', rtrim(pattern, '/') || '/page') = pattern, pattern || ' as a page');
  end loop;
  perform pg_temp.check(cardinality(laria_private.app_error_route_patterns()) > 200, 'the list');
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare
  first_print text;
  second_print text;
begin
  first_print := public.record_app_error('server', 'render', '/instrumentos/[slug]/page', 'TypeError', 'Cannot read properties of null (reading ''price'') for la13-uno@example.invalid', '', '1234567890');
  second_print := public.record_app_error('server', 'render', '/instrumentos/[slug]/page', 'TypeError', 'Cannot read properties of null (reading ''price'') for la13-otra@example.invalid', '', '1234567890');
  perform pg_temp.check(first_print = second_print and first_print ~ '^[0-9a-f]{32}$', 'the same error counts under one fingerprint');
  perform pg_temp.check(public.record_app_error('server', 'render', '/tiendas/[slug]', 'TypeError', 'Cannot read properties of null (reading ''price'') for <email>', '', null) <> first_print,
    'the same server error on another route is another kind');
  perform pg_temp.check(public.record_app_error('server', 'route', '/api/contact', 'Error', 'timeout after 3000 ms', '', null)
    = public.record_app_error('server', 'route', '/api/contact', 'Error', 'timeout after 5000 ms', '', null), 'numbers don''t split a kind');
  -- Browser errors: the page's pattern is kept but doesn't split a kind; the browser does.
  first_print := public.record_app_error('browser', 'error', '/instrumentos/guitarra-fender-a1b2c3', 'ReferenceError', 'gtag is not defined', 'Safari iOS', null);
  perform pg_temp.check(public.record_app_error('browser', 'error', '/tiendas/la-casa-del-musico', 'ReferenceError', 'gtag is not defined', 'Safari iOS', null) = first_print,
    'one bug on every page is one kind');
  perform pg_temp.check(public.record_app_error('browser', 'error', '/tiendas/la-casa-del-musico', 'ReferenceError', 'ga is not defined', 'Safari iOS', null) = first_print,
    'one known message whatever the name in it');
  perform pg_temp.check(public.record_app_error('browser', 'error', '/', 'ReferenceError', 'gtag is not defined', 'Chrome Android', null) <> first_print,
    'another browser is another kind');
  -- Anything malformed is stored as a plain value, never as given.
  perform public.record_app_error('browser', 'DROP TABLE', '/vender', '<script>', 'raro', 'Chrome<b>', 'no digest!');
  perform pg_temp.expect_error('select public.record_app_error(''ios'', ''error'', ''/'', ''Error'', ''x'')', 'APP_ERROR_INVALID');
  perform pg_temp.expect_error('select public.record_app_error(null, ''error'', ''/'', ''Error'', ''x'')', 'APP_ERROR_INVALID');
end $$;
reset role;

do $$ begin
  perform pg_temp.check((select occurrences = 2 and message = 'Cannot read properties of null (reading ''…'') for <email>'
      and route = '/instrumentos/[slug]' and digest = '1234567890' and source = 'server' and kind = 'render'
    from laria_private.app_errors where route = '/instrumentos/[slug]'), 'two of the same, with no address kept');
  perform pg_temp.check((select occurrences = 3 and route = '/tiendas/[slug]' and client = 'Safari iOS' and message = '… is not defined'
    from laria_private.app_errors where name = 'ReferenceError' and client = 'Safari iOS'), 'the latest page is the one kept, as a pattern');
  perform pg_temp.check((select kind = 'error' and name = 'Error' and client = '' and digest is null
      and message = 'Otro mensaje (no se guarda el texto)'
    from laria_private.app_errors where route = '/vender'), 'malformed values are replaced');
  perform pg_temp.check((select count(*) from laria_private.app_errors) = 6, 'six kinds so far');
  perform pg_temp.check(not exists (select 1 from laria_private.app_errors where message ~ '@|la13-'), 'no address is kept anywhere');
  perform pg_temp.check(not exists (select 1 from laria_private.app_errors where route ~ 'guitarra|casa'), 'nor any listing''s or store''s slug');
end $$;

-- What a made-up report can carry: names, browsers, digests, pages and messages are kept only from fixed lists.
savepoint made_up;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  perform public.record_app_error('browser', 'error', '/tiendas/ana-perez?ref=whatsapp#fotos', 'AnaPerez', 'Ana Perez: invalid name', 'Ana Perez', 'ana_perez');
  perform public.record_app_error('browser', 'unhandledrejection', '/mi-cuenta/publicaciones/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b/editar', 'AuthApiError',
    'Cannot read properties of undefined (reading ''ana.perez@example.invalid'')', 'Chrome Android', null);
  perform public.record_app_error('browser', 'boundary', '/tiendas/taller', 'NotAllowedError', 'Av. Arequipa 1234, Lima', 'Otro', null);
  perform public.record_app_error('server', 'render', '/(tienda)/tiendas/[slug]/page', 'AuthApiError', 'x4', 'Chrome', '2876543210');
  perform public.record_app_error('server', 'route', '/tiendas/ana-perez', 'AnaPerez', 'x5', '', 'no digest!');
  perform public.record_app_error('server', 'route', '/sitemap.xml/route', 'PostgrestException', 'x6', '', null);
end $$;
reset role;
do $$ begin
  perform pg_temp.check((select route = '/tiendas/[slug]' and client = '' and digest is null and message = 'Otro mensaje (no se guarda el texto)'
    from laria_private.app_errors where source = 'browser' and kind = 'error' and name = 'Error' and route <> '/vender'),
    'a browser''s made-up name, browser, digest, slug and message are not kept');
  perform pg_temp.check((select route = '/mi-cuenta/publicaciones/[id]/editar' and name = 'Error' and client = 'Chrome Android'
      and message = 'Cannot read properties of undefined (reading ''…'')'
    from laria_private.app_errors where kind = 'unhandledrejection'), 'a browser''s name must be JavaScript''s or the DOM''s own');
  perform pg_temp.check((select route = '/tiendas/[slug]' and name = 'NotAllowedError' and client = 'Otro'
      and message = 'Otro mensaje (no se guarda el texto)'
    from laria_private.app_errors where kind = 'boundary'), 'a store named like a folder still reads as a pattern');
  perform pg_temp.check((select route = '/tiendas/[slug]' and name = 'AuthApiError' and client = '' and digest = '2876543210'
    from laria_private.app_errors where message = 'x4'), 'the server keeps its own error class and its digest, never a browser');
  perform pg_temp.check((select route = '/tiendas/[slug]' and name = 'Error' and digest is null
    from laria_private.app_errors where message = 'x5'), 'a server route that is no pattern loses its slug');
  perform pg_temp.check((select route = '/sitemap.xml' and name = 'PostgrestException'
    from laria_private.app_errors where message = 'x6'), 'metadata routes and exceptions');
  perform pg_temp.check(not exists (select 1 from laria_private.app_errors where message ~* 'ana|perez|arequipa|lima|@'
      or route ~* 'ana|perez|taller'), 'nothing made up is kept');
  perform pg_temp.check(laria_private.app_error_route('browser', '') = '' and laria_private.app_error_route('browser', null) = ''
    and laria_private.app_error_route('browser', '/listados/') = '/listados'
    and laria_private.app_error_route('browser', '/tiendas/laria') = '/tiendas/[slug]'
    and laria_private.app_error_route('browser', '/instrumentos/guitarras') = '/instrumentos/guitarras'
    and laria_private.app_error_route('browser', '/instrumentos/fender-strat-a1b2') = '/instrumentos/[slug]'
    and laria_private.app_error_route('browser', '/admin/auditoria/listing/123') = '/admin/auditoria/[targetType]/[targetId]'
    and laria_private.app_error_route('browser', '/admin/x/y/z') = '/admin/[section]/[...rest]'
    and laria_private.app_error_route('browser', '/ana-perez') = '/…'
    and laria_private.app_error_route('browser', '/tiendas/laria/x/y') = '/tiendas/…'
    and laria_private.app_error_route('browser', '/tiendas//x') = '/tiendas/…'
    and laria_private.app_error_route('server', '/instrumentos/[slug]/opengraph-image-1a2b3c/[[...__metadata_id__]]/route')
      = '/instrumentos/[slug]/opengraph-image'
    and laria_private.app_error_route('server', '/_not-found/page') = '/_not-found'
    and laria_private.app_error_route('server', '/middleware') = '/middleware'
    and length(laria_private.app_error_route('server', repeat('/[id]', 300))) <= 200, 'empty, trailing, unknown and long routes');
end $$;
rollback to savepoint made_up;

-- ------------------------------------------------------------------ the cap

-- 25 kinds per source in a bucket; the rest count under one overflow row, and a kind already seen keeps counting.
-- A browser's made-up messages are all one kind, so its kinds here differ by the error's name.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare
  v_print text;
  v_names text[] := array['AggregateError', 'EvalError', 'InternalError', 'RangeError', 'SyntaxError', 'TypeError',
    'URIError', 'DOMException', 'AbortError', 'ChunkLoadError', 'ConstraintError', 'DataCloneError', 'DataError',
    'EncodingError', 'HierarchyRequestError', 'IndexSizeError', 'InvalidAccessError', 'InvalidCharacterError',
    'InvalidModificationError', 'InvalidNodeTypeError', 'InvalidStateError', 'NamespaceError', 'NetworkError',
    'NotAllowedError'];
begin
  -- Three browser kinds so far; a hundred made-up messages are one of them.
  v_print := public.record_app_error('browser', 'error', '/', 'Error', 'error de prueba de Ana', '', null);
  for i in 1 .. 100 loop
    perform pg_temp.check(public.record_app_error('browser', 'error', '/', 'Error', 'error ' || i || ' de ' || md5(i::text), '', null)
      = v_print, 'made-up messages are one kind');
  end loop;
  -- 22 more make 25.
  for i in 1 .. 22 loop
    perform public.record_app_error('browser', 'error', '/', v_names[i], 'error de prueba', '', null);
  end loop;
  v_print := public.record_app_error('browser', 'error', '/', v_names[23], 'una más', '', null);
  perform pg_temp.check(v_print = 'overflow-browser', 'the 26th browser kind goes to the overflow row: ' || v_print);
  perform pg_temp.check(public.record_app_error('browser', 'error', '/', v_names[24], 'y otra', '', null) = 'overflow-browser', 'and the next');
  perform pg_temp.check(public.record_app_error('browser', 'error', '/', v_names[1], 'otra vez', '', null) <> 'overflow-browser',
    'a kind already seen keeps its own row');
  perform pg_temp.check(public.record_app_error('server', 'action', '/vender', 'Error', 'otro tipo', '', null) <> 'overflow-server',
    'the server has its own cap');
end $$;
reset role;

do $$ begin
  perform pg_temp.check((select count(*) from laria_private.app_errors where source = 'browser') = 26, '25 browser kinds and the overflow row');
  perform pg_temp.check((select occurrences = 2 and kind = 'overflow' and name = 'Overflow' and route = ''
    from laria_private.app_errors where fingerprint = 'overflow-browser'), 'the overflow row counts the rest');
end $$;

-- ------------------------------------------------------------------ Admin

-- An older count of the first server error, two days ago, and one 31 days ago that no period shows.
insert into laria_private.app_errors(fingerprint, bucket, source, kind, route, name, message, digest, occurrences, first_at, last_at)
select fingerprint, pg_temp.bucket(now() - interval '2 days'), source, kind, route, name, message, digest, 3,
  now() - interval '2 days', now() - interval '2 days'
from laria_private.app_errors where route = '/instrumentos/[slug]';
insert into laria_private.app_errors(fingerprint, bucket, source, kind, route, name, message, occurrences, first_at, last_at)
values ('la13-antiguo', pg_temp.bucket(now() - interval '31 days'), 'server', 'route', '/api/antigua', 'Error', 'antiguo', 1,
  now() - interval '31 days', now() - interval '31 days');

set local role authenticated;
select pg_temp.claims('a1300000-0000-4000-8000-000000000001', false, 'aal2');
select pg_temp.expect_error('select public.get_admin_app_errors(7, null)', 'ADMIN_REQUIRED');
select pg_temp.claims('a1300000-0000-4000-8000-000000000002', true, 'aal1');
select pg_temp.expect_error('select public.get_admin_app_errors(7, null)', 'ADMIN_MFA_REQUIRED');
select pg_temp.claims('a1300000-0000-4000-8000-000000000002', true, 'aal2');
select pg_temp.expect_error('select public.get_admin_app_errors(0, null)', 'APP_ERRORS_INVALID');
select pg_temp.expect_error('select public.get_admin_app_errors(31, null)', 'APP_ERRORS_INVALID');
select pg_temp.expect_error('select public.get_admin_app_errors(7, ''ios'')', 'APP_ERRORS_INVALID');
do $$ declare
  listing jsonb;
  week jsonb := public.get_admin_app_errors(7, null);
  month jsonb := public.get_admin_app_errors(30, null);
begin
  perform pg_temp.check(jsonb_array_length(week) = 30, '30 kinds this week: ' || jsonb_array_length(week));
  perform pg_temp.check(jsonb_array_length(month) = 30, 'the 31-day-old count is outside every period');
  select item into listing from jsonb_array_elements(week) item where item ->> 'route' = '/instrumentos/[slug]';
  perform pg_temp.check((listing ->> 'occurrences')::integer = 5 and (listing ->> 'first_at')::timestamptz < now() - interval '1 day'
    and listing ->> 'digest' = '1234567890' and listing ->> 'kind' = 'render', 'a kind sums its buckets: ' || listing::text);
  select item into listing from jsonb_array_elements(public.get_admin_app_errors(1, null)) item where item ->> 'route' = '/instrumentos/[slug]';
  perform pg_temp.check((listing ->> 'occurrences')::integer = 2, 'the last 24 hours leave out the older count');
  perform pg_temp.check((select bool_and(item ->> 'source' = 'server') and count(*) = 4
    from jsonb_array_elements(public.get_admin_app_errors(7, 'server')) item), 'the server''s four kinds');
  perform pg_temp.check((select bool_and(item ->> 'source' = 'browser') and count(*) = 26
    from jsonb_array_elements(public.get_admin_app_errors(7, 'browser')) item), 'the browsers'' 26 rows');
  perform pg_temp.check((select bool_and((a ->> 'last_at')::timestamptz >= (b ->> 'last_at')::timestamptz)
    from jsonb_array_elements(week) with ordinality x(a, n) join jsonb_array_elements(week) with ordinality y(b, m) on m = n + 1),
    'newest first');
end $$;
reset role;

-- ------------------------------------------------------------------ health

-- One more server error in the bucket before this one (included) and one 30 minutes ago (not).
insert into laria_private.app_errors(fingerprint, bucket, source, kind, route, name, message, occurrences, first_at, last_at)
values
 ('la13-anterior', pg_temp.bucket(now()) - interval '10 minutes', 'server', 'render', '/', 'Error', 'anterior', 4, now(), now()),
 ('la13-media-hora', pg_temp.bucket(now()) - interval '30 minutes', 'server', 'render', '/', 'Error', 'media hora', 50, now(), now());

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare health jsonb := public.get_app_health(); begin
  -- This bucket: 2 + 1 + 2 + 1 server errors; the bucket before: 4. Browser errors don't count.
  perform pg_temp.check(health = '{"server_errors": 10}'::jsonb, 'the server errors of the last 10 to 20 minutes: ' || health::text);
end $$;
reset role;

-- ------------------------------------------------------------------ retention

do $$ begin
  perform pg_temp.check(laria_private.run_app_error_retention() = 1, 'only the count older than 30 days goes');
  perform pg_temp.check(not exists (select 1 from laria_private.app_errors where fingerprint = 'la13-antiguo')
    and exists (select 1 from laria_private.app_errors where bucket < now() - interval '1 day'), 'the two-day-old count stays');
end $$;

rollback;
