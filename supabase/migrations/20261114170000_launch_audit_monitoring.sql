-- Launch audit A13: no error tracking, uptime checks or alerts.
--
-- Before: an error in a page, an API route, a server action or a visitor's browser left at most a line in Vercel's
-- runtime logs, and nobody would hear of an outage before the users did.
--
-- After:
-- 1. laria_private.app_errors counts each kind of error per 10 minutes, from the server (instrumentation.ts,
--    onRequestError) and from browsers (/api/client-errors), and keeps the counts 30 days (pg_cron
--    app-error-retention, daily at 09:50 UTC). public.record_app_error, for the service role only, keeps:
--    - the route as one of the site's own page and route patterns (laria_private.app_error_route), matched the way
--      Next.js matches an address, so a store's or a listing's slug reads [slug] or [id] even when it is spelled like
--      one of the site's folders; an address no pattern matches keeps only its first segment;
--    - the error's name only when it is one of JavaScript's or the DOM's (on the server also a class of the app's own
--      ending in Error or Exception), otherwise Error;
--    - the message, from the server or a browser, only as one of a fixed set (laria_private.app_error_message): the
--      site's own messages and codes (laria_private.app_error_own_messages), and the known messages of browsers,
--      JavaScript engines, React, Next.js, Node, Postgres, PostgREST, Supabase and Resend
--      (laria_private.app_error_messages), with any value in them read as …. One of the site's own followed by ':'
--      keeps that part, then the rest only when it is one of these, otherwise …. Any other message reads "Otro mensaje
--      (no se guarda el texto)": nothing a visitor, a database value or a made-up report writes is kept as written.
--      The full message stays only in Vercel's runtime logs, found by the route, the time and the digest;
--    - the browser family from a fixed list, and the server's digest.
--    Never an account, an IP address or a stack. Only an Admin with the second sign-in step reads the counts, and they
--    are gone after 30 days. At most 25 kinds per source in each 10 minutes, admitted one at a time; the rest are
--    counted in one overflow row, so a flood of made-up reports can't fill the database.
-- 2. public.get_admin_app_errors(days, source) lists them for Admin (/admin/errores), grouped by kind, newest first.
-- 3. public.get_app_health() gives /api/health the server errors of the last 10 to 20 minutes. The uptime check
--    (.github/workflows/uptime.yml) fails, and GitHub e-mails the owner, when the site or the database doesn't answer
--    or those errors reach 20.
--
-- Compatibility: new objects only.
-- Locks: none beyond creating the table and the functions.
-- Rollback: select cron.unschedule('app-error-retention'); then drop the eleven functions and laria_private.app_errors.

set lock_timeout = '10s';

-- ----------------------------------------------------------------------------------------------- 1. the counts

create table if not exists laria_private.app_errors (
  fingerprint text not null,
  bucket timestamptz not null,
  source text not null check (source in ('server', 'browser')),
  kind text not null,
  route text not null default '',
  name text not null,
  message text not null default '',
  client text not null default '',
  digest text,
  occurrences integer not null default 1 check (occurrences > 0),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (fingerprint, bucket)
);
create index if not exists app_errors_bucket_idx on laria_private.app_errors (bucket, source);
alter table laria_private.app_errors enable row level security;
revoke all on laria_private.app_errors from public, anon, authenticated;

-- Every address of Laria's pages and API routes as a pattern: the page and route files under app/ on main and on
-- features/marketplace, the metadata files, and Next.js's own (the middleware, the not-found and error pages). A new
-- page or route goes here too (tests/launch-audit-monitoring.test.cjs checks every one is listed); until then its
-- errors read only its first segment.
create or replace function laria_private.app_error_route_patterns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    '/', '/_error', '/_global-error', '/_not-found', '/admin', '/admin/[section]', '/admin/[section]/[...rest]',
    '/admin/artistas', '/admin/auditoria/[targetType]/[targetId]', '/admin/ayuda', '/admin/campanas',
    '/admin/campanas/[id]', '/admin/colecciones', '/admin/confianza', '/admin/distribuidores',
    '/admin/equipos-reportados', '/admin/errores', '/admin/fabricantes', '/admin/fotos-repetidas',
    '/admin/medios-de-pago', '/admin/servicios', '/api/account-navigation', '/api/account/data',
    '/api/account/delete', '/api/account/email', '/api/account/sessions', '/api/account/sessions/device',
    '/api/account/sessions/everywhere', '/api/account/two-step/recovery', '/api/admin/campaigns',
    '/api/admin/dealers', '/api/admin/dealers/[id]/document', '/api/admin/discovery', '/api/admin/help-tickets',
    '/api/admin/installments', '/api/admin/invite-user', '/api/admin/listing-flags', '/api/admin/payment-methods',
    '/api/admin/red-flags', '/api/admin/stolen-gear', '/api/alerts', '/api/auth/check-email', '/api/auth/login',
    '/api/auth/resend-confirmation', '/api/catalog/facets', '/api/catalog/gone', '/api/catalog/map',
    '/api/catalog/page', '/api/catalog/suggest', '/api/client-errors', '/api/contact', '/api/csp-report',
    '/api/discovery/listing', '/api/discovery/store', '/api/email/preferences', '/api/email/unsubscribe',
    '/api/events', '/api/events/session', '/api/favorites', '/api/favorites/share', '/api/feeds/laria',
    '/api/feeds/tiendas/[slug]', '/api/follows', '/api/health', '/api/help/tickets', '/api/internal/email/process',
    '/api/internal/jobs/campaigns', '/api/internal/jobs/deal-trust', '/api/internal/jobs/demand-report',
    '/api/internal/jobs/gear-reminders', '/api/internal/jobs/photo-fingerprints', '/api/internal/jobs/price-steps',
    '/api/internal/jobs/store-floor', '/api/internal/jobs/trade-offers', '/api/internal/public-pages/refresh',
    '/api/internal/push/process', '/api/internal/store-imports/cleanup', '/api/internal/uploads/sweep',
    '/api/listing-details/bundle-offer', '/api/listing-images/[...path]', '/api/listing-questions',
    '/api/listing-reviews', '/api/listing-viewer', '/api/listings/[id]/manage', '/api/listings/[id]/photo-cleanup',
    '/api/listings/[id]/photos', '/api/listings/[id]/view', '/api/listings/refresh', '/api/public-pages/probe',
    '/api/review-photos/[id]', '/api/services/events', '/api/stolen-gear/reports', '/api/stolen-gear/status',
    '/api/store/campaigns', '/api/store/dealers', '/api/store/dealers/[id]/complete', '/api/store/feeds',
    '/api/store/imports', '/api/store/imports/[id]', '/api/store/imports/[id]/photo-uploads',
    '/api/store/imports/[id]/photo-uploads/complete', '/api/store/imports/[id]/photos',
    '/api/store/imports/[id]/photos/[assetId]', '/api/store/imports/[id]/publication',
    '/api/store/imports/[id]/publication/fields', '/api/store/imports/[id]/report', '/api/store/imports/[id]/rows',
    '/api/store/imports/[id]/step', '/api/store/imports/publish-selection', '/api/store/imports/template',
    '/api/store/installments', '/api/store/inventory', '/api/store/inventory/export', '/api/store/inventory/reorder',
    '/api/store/mercado-libre/callback', '/api/store/mercado-libre/connect', '/api/store/mercado-libre/disconnect',
    '/api/store/mercado-libre/import', '/api/store/mercado-libre/items', '/api/store/mercado-libre/photos',
    '/api/store/payment-methods', '/api/store/receipts', '/api/submissions', '/api/trade-photos/[...path]',
    '/apple-icon.png', '/articulos-prohibidos', '/artistas', '/auth/callback', '/ayuda', '/ayuda/[slug]',
    '/ayuda/mis-consultas', '/campanas', '/campanas/[slug]', '/colecciones', '/colecciones/[slug]', '/comparar',
    '/compartir', '/compartir/recibir', '/compra-en-tienda/[token]', '/comprador/[token]', '/confirmacion-correo',
    '/consejos-de-seguridad', '/correos/baja', '/favoritos', '/favoritos/compartida/[token]', '/guias',
    '/guias/[slug]', '/hecho-en-peru', '/icon.svg', '/instrumentos/[slug]', '/instrumentos/[slug]/historia',
    '/instrumentos/[slug]/opengraph-image', '/instrumentos/amplificadores', '/instrumentos/andinos',
    '/instrumentos/audio', '/instrumentos/bajos', '/instrumentos/cuerdas', '/instrumentos/guitarras',
    '/instrumentos/microfonos', '/instrumentos/pedales', '/instrumentos/percusion', '/instrumentos/teclados',
    '/instrumentos/vientos', '/libro-de-reclamaciones', '/listados', '/login', '/logout', '/manifest.webmanifest',
    '/mi-cuenta', '/mi-cuenta/alertas', '/mi-cuenta/correos', '/mi-cuenta/datos', '/mi-cuenta/equipo',
    '/mi-cuenta/equipo/[id]', '/mi-cuenta/equipo/consignacion/[token]', '/mi-cuenta/equipo/nuevo',
    '/mi-cuenta/equipo/ofertas', '/mi-cuenta/equipo/ofertas/[id]', '/mi-cuenta/equipo/ofertas/nueva',
    '/mi-cuenta/equipo/parte-de-pago', '/mi-cuenta/estadisticas', '/mi-cuenta/favoritos', '/mi-cuenta/favoritos/[id]',
    '/mi-cuenta/notificaciones', '/mi-cuenta/perfil', '/mi-cuenta/pruebas', '/mi-cuenta/publicaciones',
    '/mi-cuenta/publicaciones/[id]/editar', '/mi-cuenta/publicaciones/[id]/herramientas',
    '/mi-cuenta/publicaciones/[id]/vista-previa', '/mi-cuenta/publicaciones/editar/[slug]', '/mi-cuenta/publicar',
    '/mi-cuenta/seguridad', '/mi-cuenta/servicios', '/mi-cuenta/servicios/[id]/editar', '/mi-cuenta/servicios/nuevo',
    '/mi-cuenta/tienda', '/mi-cuenta/tienda/campanas', '/mi-cuenta/tienda/campanas/[id]',
    '/mi-cuenta/tienda/catalogo-redes', '/mi-cuenta/tienda/comprobantes', '/mi-cuenta/tienda/demanda',
    '/mi-cuenta/tienda/distribuidor', '/mi-cuenta/tienda/estadisticas', '/mi-cuenta/tienda/etiquetas',
    '/mi-cuenta/tienda/etiquetas/cartel', '/mi-cuenta/tienda/garantia', '/mi-cuenta/tienda/inventario',
    '/mi-cuenta/tienda/inventario/[itemId]', '/mi-cuenta/tienda/inventario/importar',
    '/mi-cuenta/tienda/inventario/importar/[sessionId]', '/mi-cuenta/tienda/inventario/mostrador',
    '/mi-cuenta/tienda/inventario/precios', '/mi-cuenta/tienda/inventario/reponer',
    '/mi-cuenta/tienda/medios-de-pago', '/mi-cuenta/tienda/mercado-libre', '/mi-cuenta/tienda/ofertas',
    '/mi-cuenta/tienda/ofertas/[id]', '/mi-cuenta/tienda/ofertas/ajustes', '/mi-cuenta/tienda/pagos',
    '/mi-cuenta/tienda/pruebas', '/mi-cuenta/tienda/pruebas/horario', '/mi-cuenta/tienda/publicar',
    '/mi-cuenta/tienda/publicar-seleccionados/[sessionId]', '/mi-cuenta/tienda/sedes',
    '/mi-cuenta/tienda/solicitudes', '/mi-cuenta/tienda/taller', '/mi-cuenta/tienda/valores-por-defecto',
    '/mi-cuenta/transacciones', '/mi-cuenta/transacciones/[id]', '/middleware', '/opengraph-image', '/privacidad',
    '/publicar', '/recuperar-contrasena', '/regalos', '/regalos/[ocasion]', '/registrar-tienda', '/registro/tienda',
    '/registro/tienda/invitacion', '/registro/vendedor', '/registro/vendedor/invitacion', '/reportar-robo',
    '/reportar-robo/mis-reportes', '/restablecer-contrasena', '/robots.txt', '/servicios', '/servicios/[categoria]',
    '/servicios/[categoria]/[slug]', '/sitemap.xml', '/terminos', '/tiendas', '/tiendas/[slug]', '/vendedores/[slug]',
    '/vender'
  ]::text[];
$$;

-- An error's route as one of laria_private.app_error_route_patterns(), at most 200 characters, never the address
-- itself. A browser page's path is matched the way Next.js matches it: a fixed segment before a [param], a [param]
-- before a [...catch-all], so /tiendas/taller reads /tiendas/[slug] even though taller is also a folder's name. The
-- server's route file pattern (Next.js's routePath, such as /tiendas/[slug]/page) is matched the same way once
-- Next.js's own parts are set aside: (group) and @slot folders, a final page or route, and a metadata image's suffix.
-- A path no pattern matches keeps only its first segment when that begins one of the patterns, then /…; anything else
-- reads /….
create or replace function laria_private.app_error_route(p_source text, p_route text)
returns text
language sql
immutable
set search_path = ''
as $$
  with given as (
    select split_part(split_part(left(coalesce(p_route, ''), 1000), '?', 1), '#', 1) as path
  ), named as (
    select array(
      select case when p_source = 'server'
        then regexp_replace(part.segment, '^(opengraph-image|twitter-image|icon|apple-icon)-[A-Za-z0-9]{1,16}$', '\1')
        else part.segment end
      from unnest(string_to_array(trim(both '/' from given.path), '/')) with ordinality as part(segment, position)
      where not (p_source = 'server' and part.segment ~ '^(\(.*\)|@.+|\[\[\.\.\.__metadata_id__\]\])$')
      order by part.position
    ) as segments
    from given
  ), path as (
    select case when p_source = 'server' and segments[cardinality(segments)] in ('page', 'route')
      then segments[1:cardinality(segments) - 1] else segments end as segments
    from named
  ), candidate as (
    select pattern, string_to_array(trim(both '/' from pattern), '/') as segments
    from unnest(laria_private.app_error_route_patterns()) as pattern
  )
  select case when (select given.path from given) = '' then '' else left(coalesce(
    (select candidate.pattern
     from candidate, path
     where case
         when candidate.segments[cardinality(candidate.segments)] like '[[...%'
           then cardinality(path.segments) >= cardinality(candidate.segments) - 1
         when candidate.segments[cardinality(candidate.segments)] like '[...%'
           then cardinality(path.segments) >= cardinality(candidate.segments)
         else cardinality(path.segments) = cardinality(candidate.segments)
       end
       and not exists (
         select 1 from generate_subscripts(candidate.segments, 1) as i
         where case
           when candidate.segments[i] like '[[...%' then false
           when candidate.segments[i] like '[%' then coalesce(path.segments[i], '') = ''
           else path.segments[i] is distinct from candidate.segments[i]
         end)
     -- Next.js's order: segment by segment, fixed (0) before [param] (1), [...catch-all] (2) and [[...optional]] (3).
     order by (select string_agg(case when kind.segment like '[[...%' then '3' when kind.segment like '[...%' then '2'
         when kind.segment like '[%' then '1' else '0' end, '' order by kind.position)
       from unnest(candidate.segments) with ordinality as kind(segment, position)) collate "C" nulls first,
       candidate.pattern collate "C"
     limit 1),
    (select case
       when cardinality(path.segments) = 0 then '/'
       when path.segments[1] in (select candidate.segments[1] from candidate where candidate.segments[1] not like '[%')
         then '/' || path.segments[1] || case when cardinality(path.segments) > 1 then '/…' else '' end
       else '/…'
     end
     from path)), 200) end;
$$;

-- The known messages an error's message may be kept as: those of browsers, JavaScript engines, React, Next.js, Node,
-- Postgres, PostgREST, Supabase and Resend, with whatever names a value in them (a property, a variable, an address, a
-- constraint) read as …. They are tried in order on the message as one line, without "Uncaught " or an error name in
-- front, and the first whose pattern matches replaces the whole line with its message; \1 and \2 bring back only a
-- word from the pattern's own list (a React error's number only when it is one of React's own codes). Each message
-- reads back as itself (tests/launch-audit-monitoring.sql).
create or replace function laria_private.app_error_messages()
returns table (ordinal integer, pattern text, message text)
language sql
immutable
set search_path = ''
as $$
  values
    (1, '^Loading CSS chunk [^ ]+ failed',
      'Loading CSS chunk … failed.'),
    (2, '^Loading chunk [^ ]+ failed',
      'Loading chunk … failed.'),
    (3, '^Failed to load chunk ',
      'Failed to load chunk … from module …'),
    (4, '^Failed to fetch dynamically imported module',
      'Failed to fetch dynamically imported module: …'),
    (5, '^error loading dynamically imported module',
      'error loading dynamically imported module: …'),
    (6, '^Importing a module script failed',
      'Importing a module script failed.'),
    (7, '^Failed to load module script',
      'Failed to load module script: …'),
    (8, '^Failed to find Server Action',
      'Failed to find Server Action. This request might be from an older or newer deployment.'),
    (9, '^Server Action .* was not found on the server',
      'Server Action … was not found on the server.'),
    (10, '^An unexpected response was received from the server',
      'An unexpected response was received from the server.'),
    (11, '^Minified React error #(31|33|60|61|62|65|90|91|92|93|130|137|143|150|151|153|156|160|161|162|163|166|177|185|188|189|190|191|231|248|257|267|268|284|299|300|301|306|308|310|311|312|314|317|318|321|327|329|331|340|341|343|345|349|362|364|365|387|389|390|391|392|393|394|395|397|399|400|401|402|403|404|407|409|418|419|422|423|424|426|432|435|438|440|443|444|446|451|452|453|454|459|460|461|462|467|468|474|475|476|479|480|482|483|485|486|487|488|490|491|493|494|495|496|497|501|519|520|522|525|527|528|529|530|542|544|545|549|552|554|555|557|558|559|561)(?![0-9])',
      'Minified React error #\1'),
    (12, '^Minified React error #',
      'Minified React error #…'),
    (13, '^Hydration failed',
      'Hydration failed because the server rendered HTML didn''t match the client.'),
    (14, '^There was an error while hydrating',
      'There was an error while hydrating.'),
    (15, '^Text content does not match server-rendered HTML',
      'Text content does not match server-rendered HTML.'),
    (16, '^This Suspense boundary received an update before it finished hydrating',
      'This Suspense boundary received an update before it finished hydrating.'),
    (17, '^Switched to client rendering because the server rendering errored',
      'Switched to client rendering because the server rendering errored.'),
    (18, '^The server could not finish this Suspense boundary',
      'The server could not finish this Suspense boundary.'),
    (19, '^An error occurred in the Server Components render',
      'An error occurred in the Server Components render.'),
    (20, '^Rendered more hooks than',
      'Rendered more hooks than during the previous render.'),
    (21, '^Rendered fewer hooks than',
      'Rendered fewer hooks than expected.'),
    (22, '^Objects are not valid as a React child',
      'Objects are not valid as a React child.'),
    (23, '^Too many re-renders',
      'Too many re-renders.'),
    (24, '^Maximum update depth exceeded',
      'Maximum update depth exceeded.'),
    (25, '^Should not already be working',
      'Should not already be working.'),
    (26, '^Connection closed',
      'Connection closed.'),
    (27, '^Invariant: ',
      'Invariant: …'),
    (28, '^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)',
      '\1'),
    (29, '^Failed to execute ''removeChild'' on ''Node''',
      'Failed to execute ''removeChild'' on ''Node'': The node to be removed is not a child of this node.'),
    (30, '^Failed to execute ''insertBefore'' on ''Node''',
      'Failed to execute ''insertBefore'' on ''Node'': The node before which the new node is to be inserted is not a child of this node.'),
    (31, '^The object can not be found here',
      'The object can not be found here.'),
    (32, '^Failed to read the ''(localStorage|sessionStorage|indexedDB|cookie)'' property from ''(Window|Document)''',
      'Failed to read the ''\1'' property from ''\2'': …'),
    (33, '^Failed to execute ''[^'']{1,60}'' on ''[^'']{1,60}''',
      'Failed to execute ''…'' on ''…'': …'),
    (34, '^Failed to construct ''[^'']{1,60}''',
      'Failed to construct ''…'': …'),
    (35, '^Failed to read the ''[^'']{1,60}'' property',
      'Failed to read the ''…'' property from ''…'': …'),
    (36, '^Failed to set the ''[^'']{1,60}'' property',
      'Failed to set the ''…'' property on ''…'': …'),
    (37, '^Failed to register a ServiceWorker',
      'Failed to register a ServiceWorker: …'),
    (38, '^Registration failed',
      'Registration failed: …'),
    (39, '^(The quota has been exceeded|.*exceeded the quota)',
      'The quota has been exceeded.'),
    (40, '^The operation is insecure',
      'The operation is insecure.'),
    (41, '^Access is denied for this document',
      'Access is denied for this document.'),
    (42, '^The request is not allowed by the user agent or the platform in the current context',
      'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.'),
    (43, '^Permission denied',
      'Permission denied.'),
    (44, '^The play\(\) request was interrupted',
      'The play() request was interrupted.'),
    (45, '^play\(\) failed because the user didn''t interact with the document first',
      'play() failed because the user didn''t interact with the document first.'),
    (46, '^The element has no supported sources',
      'The element has no supported sources.'),
    (47, '^(Share canceled|Abort due to cancellation of share)',
      '\1'),
    (48, '^Acquiring an exclusive Navigator LockManager lock',
      'Acquiring an exclusive Navigator LockManager lock … failed.'),
    (49, '^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource|cancelled)',
      '\1'),
    (50, '^(The network connection was lost|The Internet connection appears to be offline)',
      '\1'),
    (51, '^(The operation was aborted|The user aborted a request|signal is aborted without reason)',
      '\1'),
    (52, '^(Request|The request) timed out',
      'Request timed out.'),
    (53, '^Invalid Refresh Token',
      'Invalid Refresh Token: …'),
    (54, '^Auth session missing',
      'Auth session missing!'),
    (55, '^JWT expired',
      'JWT expired'),
    (56, '^Can''t find variable: ',
      'Can''t find variable: …'),
    (57, '^(undefined|null) is not an object',
      '\1 is not an object (evaluating ''…'')'),
    (58, '^Cannot read properties of (undefined|null)',
      'Cannot read properties of \1 (reading ''…'')'),
    (59, '^Cannot read property .* of (undefined|null)',
      'Cannot read properties of \1 (reading ''…'')'),
    (60, '^Cannot set properties of (undefined|null)',
      'Cannot set properties of \1 (setting ''…'')'),
    (61, '^Cannot set property .* of (undefined|null)',
      'Cannot set properties of \1 (setting ''…'')'),
    (62, '^can''t access property .*, .* is (undefined|null)',
      'can''t access property …, … is \1'),
    (63, '^Cannot destructure property .* as it is (undefined|null)',
      'Cannot destructure property ''…'' of ''…'' as it is \1.'),
    (64, '^Cannot destructure ',
      'Cannot destructure …'),
    (65, '^Right side of assignment cannot be destructured',
      'Right side of assignment cannot be destructured'),
    (66, '^Cannot access .* before initialization',
      'Cannot access ''…'' before initialization.'),
    (67, '^can''t access lexical declaration',
      'can''t access lexical declaration ''…'' before initialization'),
    (68, '^Assignment to constant variable',
      'Assignment to constant variable.'),
    (69, '^Cannot convert undefined or null to object',
      'Cannot convert undefined or null to object.'),
    (70, '^Cannot use ''in'' operator',
      'Cannot use ''in'' operator to search for ''…'' in …'),
    (71, '^Cannot assign to read only property',
      'Cannot assign to read only property ''…'' of …'),
    (72, '^Cannot add property .*, object is not extensible',
      'Cannot add property …, object is not extensible'),
    (73, '^Cannot redefine property',
      'Cannot redefine property: …'),
    (74, '^Converting circular structure to JSON',
      'Converting circular structure to JSON.'),
    (75, '^(Maximum call stack size exceeded|too much recursion|Out of memory|Illegal invocation)',
      '\1'),
    (76, '^(Invalid time value|Invalid Date|Invalid array length)',
      '\1'),
    (77, '^(Unexpected end of JSON input|Invalid or unexpected token)',
      '\1'),
    (78, '^JSON\.parse: ',
      'JSON.parse: …'),
    (79, '^JSON Parse error: ',
      'JSON Parse error: …'),
    (80, '^.* is not valid JSON',
      '… is not valid JSON'),
    (81, '^Unexpected token',
      'Unexpected token …'),
    (82, '^Unexpected (identifier|end of input|end of script|string|number|keyword|EOF)',
      'Unexpected \1'),
    (83, '^missing \) after argument list',
      'missing ) after argument list'),
    (84, '^Invalid regular expression',
      'Invalid regular expression: …'),
    (85, '^The string did not match the expected pattern',
      'The string did not match the expected pattern.'),
    (86, '^.* is not a function',
      '… is not a function'),
    (87, '^.* is not a constructor',
      '… is not a constructor'),
    (88, '^.* is not iterable',
      '… is not iterable'),
    (89, '^.* is not defined',
      '… is not defined'),
    (90, '^.* is read-only',
      '… is read-only'),
    (91, '^.* has no properties',
      '… has no properties'),
    (92, '^.* is (undefined|null)$',
      '… is \1'),
    (93, '^(undefined|null|false|\[object (Object|Event|ProgressEvent|ErrorEvent|Response|DOMException|Error)\])$',
      '\1'),
    (94, '^Java exception was raised during method invocation',
      'Java exception was raised during method invocation'),
    (95, '^Object Not Found Matching Id:',
      'Object Not Found Matching Id: …, MethodName: …, ParamCount: …'),
    (96, '^(Script error|ResizeObserver loop)',
      '\1 …'),
    (97, '^duplicate key value violates unique constraint',
      'duplicate key value violates unique constraint "…"'),
    (98, '^new row violates row-level security policy',
      'new row violates row-level security policy for table "…"'),
    (99, '^new row for relation .* violates check constraint',
      'new row for relation "…" violates check constraint "…"'),
    (100, '^null value in column .* violates not-null constraint',
      'null value in column "…" violates not-null constraint'),
    (101, '^(insert or update|update or delete) on table .* violates foreign key constraint',
      '\1 on table "…" violates foreign key constraint "…"'),
    (102, '^value too long for type',
      'value too long for type …'),
    (103, '^invalid input syntax for type',
      'invalid input syntax for type …'),
    (104, '^invalid input value for enum',
      'invalid input value for enum …'),
    (105, '^permission denied for (table|function|schema|sequence|view|relation|column|database)',
      'permission denied for \1 …'),
    (106, '^(column|relation|function|operator|type|schema|table) .* does not exist',
      '\1 … does not exist'),
    (107, '^Could not find the function',
      'Could not find the function … in the schema cache'),
    (108, '^Could not find the .* column of',
      'Could not find the ''…'' column of ''…'' in the schema cache'),
    (109, '^Could not find the table',
      'Could not find the table … in the schema cache'),
    (110, '^Could not find a relationship between',
      'Could not find a relationship between … in the schema cache'),
    (111, '^(JSON object requested, multiple \(or no\) rows returned|Cannot coerce the result to a single JSON object)',
      '\1'),
    (112, '^The result contains .* rows',
      'The result contains … rows'),
    (113, '^canceling statement due to (statement timeout|lock timeout|user request|conflict with recovery)',
      'canceling statement due to \1'),
    (114, '^could not serialize access due to (concurrent update|concurrent delete|read/write dependencies among transactions)',
      'could not serialize access due to \1'),
    (115, '^deadlock detected',
      'deadlock detected'),
    (116, '^could not obtain lock on (row|relation)',
      'could not obtain lock on \1 …'),
    (117, '^(remaining connection slots are reserved|sorry, too many clients already|too many connections)',
      '\1'),
    (118, '^(Connection terminated unexpectedly|Connection terminated due to connection timeout|terminating connection due to administrator command|server closed the connection unexpectedly|the database system is starting up|the database system is shutting down|the database system is in recovery mode)',
      '\1'),
    (119, '^(numeric field overflow|division by zero|integer out of range|bigint out of range|smallint out of range|date/time field value out of range)',
      '\1'),
    (120, '^(fetch failed|socket hang up|other side closed|getaddrinfo ENOTFOUND|getaddrinfo EAI_AGAIN|read ECONNRESET|connect ECONNREFUSED|connect ETIMEDOUT|write EPIPE|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|UND_ERR_SOCKET|UND_ERR_CLOSED|Connect Timeout Error|Headers Timeout Error|Body Timeout Error|terminated)',
      '\1'),
    (121, '^This operation was aborted',
      'This operation was aborted'),
    (122, '^Body exceeded .* limit',
      'Body exceeded … limit.'),
    (123, '^(Body is unusable|Response body object should not be disturbed or locked|Body has already been read|Body has already been used)',
      '\1'),
    (124, '^Request failed with status code',
      'Request failed with status code …'),
    (125, '^Dynamic server usage',
      'Dynamic server usage: …'),
    (126, '^Route .* couldn''t be rendered statically',
      'Route … couldn''t be rendered statically because it used …'),
    (127, '^(Page|Route) changed from static to dynamic at runtime',
      '\1 changed from static to dynamic at runtime …'),
    (128, '^(Invalid API key|No API key found in request|JWSError|JWSInvalidSignature|No suitable key or wrong key type|invalid JWT|JWT expired|JWT issued at future)',
      '\1'),
    (129, '^(Invalid login credentials|Email not confirmed|User already registered|User not found|Email rate limit exceeded|Request rate limit reached|New password should be different from the old password|Token has expired or is invalid|Email link is invalid or has expired|Signups not allowed for this instance)',
      '\1'),
    (130, '^Password should be at least',
      'Password should be at least … characters.'),
    (131, '^For security purposes, you can only request this after',
      'For security purposes, you can only request this after … seconds.'),
    (132, '^Invalid Refresh Token',
      'Invalid Refresh Token: …'),
    (133, '^Auth session missing',
      'Auth session missing!'),
    (134, '^(User from sub claim in JWT does not exist|Session from session_id claim in JWT does not exist)',
      '\1'),
    (135, '^(The resource already exists|Object not found|Bucket not found|Payload too large|The object exceeded the maximum allowed size)',
      '\1'),
    (136, '^mime type .* is not supported',
      'mime type … is not supported'),
    (137, '^You can only send testing emails to your own email address',
      'You can only send testing emails to your own email address …'),
    (138, '^The .* domain is not verified',
      'The … domain is not verified.'),
    (139, '^(Missing API key in the authorization header|API key is invalid|This API key is restricted to only send emails|Too many requests|Too Many Requests|Rate limit exceeded)',
      '\1'),
    (140, '^Received unexpected response code',
      'Received unexpected response code …'),
    (141, '^".*" is not a category landing',
      '"…" is not a category landing (lib/category-pages.ts).'),
    (142, '^(\(sin mensaje\))?$',
      '(sin mensaje)');
$$;

-- The site's own messages, kept as written: the codes and messages its database functions raise and its code throws
-- (a code its database raises as "CODE: mensaje" keeps the code), from main, the launch audit's branches and
-- features/marketplace at 7f88917. Only fixed text the site wrote, never a value. A message added later reads "Otro
-- mensaje (no se guarda el texto)" until a migration adds it here; the full message stays in Vercel's runtime logs.
create or replace function laria_private.app_error_own_messages()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'A complete Particular profile and rules acceptance are required.', 'A draft keeps its id, owner, kind and store.',
    'A listing requires 2 to 10 photos.', 'A rejection or suspension reason is required.',
    'A separate Store Owner account is required.', 'A store draft belongs to the owner''s store.',
    'ACCOUNT_AUTH_REQUIRED', 'ADMIN_AUDIT_QUERY_INVALID', 'ADMIN_DOMAIN_INVALID', 'ADMIN_HIDDEN_LISTING',
    'ADMIN_LISTING_OWNER_TYPE_INVALID', 'ADMIN_LISTING_STATUS_INVALID', 'ADMIN_MFA_REQUIRED',
    'ADMIN_PAGINATION_INVALID', 'ADMIN_QUEUE_INVALID', 'ADMIN_REPORT_REASON_INVALID', 'ADMIN_REPORT_STATUS_INVALID',
    'ADMIN_REPORT_TARGET_TYPE_INVALID', 'ADMIN_REQUIRED', 'ALERT_ALREADY_EXISTS', 'ALERT_AUTH_REQUIRED',
    'ALERT_FILTERS_INVALID', 'ALERT_FREQUENCY_INVALID', 'ALERT_NAME_INVALID', 'ALERT_NOT_OWNED',
    'ANALYTICS_TABLES_BUSY', 'ANALYTICS_WINDOW_INVALID', 'ANONYMIZE_ACCOUNT_NOT_FOUND', 'ANONYMIZE_ACTIVE_STORE',
    'ANONYMIZE_ADMIN', 'ANONYMIZE_REASON_REQUIRED', 'ANONYMIZE_SERVICE_REQUIRED',
    'APPROVED_LISTING_REQUIRES_CONTROLLED_EDIT', 'APP_ERRORS_INVALID', 'APP_ERROR_INVALID', 'ARTIST_ACCOUNT_NOT_FOUND',
    'ARTIST_CHECK_REQUIRED', 'ARTIST_LINK_INVALID', 'ARTIST_NAME_INVALID', 'ARTIST_NOTE_LENGTH', 'ARTIST_NOT_FOUND',
    'ARTIST_REQUIRED', 'ARTIST_SLUG_INVALID', 'ARTIST_SLUG_TAKEN', 'ARTIST_STORY_LENGTH', 'AUTH_REQUIRED',
    'Account unavailable.', 'Admin access required.', 'Agrega al menos 2 fotos.',
    'An eligible owner-bound store is required.', 'Analytics access denied.', 'Authenticated submission required.',
    'BUNDLE_OFFER_INVALID', 'BUNDLE_OFFER_NOT_ALLOWED', 'CAMPAIGN_AFTER_REQUIRED', 'CAMPAIGN_ALREADY_IN',
    'CAMPAIGN_DATES_INVALID', 'CAMPAIGN_DISCOUNT_INVALID', 'CAMPAIGN_DISCOUNT_SHORT', 'CAMPAIGN_ENTRY_NOT_FOUND',
    'CAMPAIGN_HISTORY_SHORT', 'CAMPAIGN_LISTING_NOT_ELIGIBLE', 'CAMPAIGN_NOT_EDITABLE', 'CAMPAIGN_NOT_FOUND',
    'CAMPAIGN_NOT_OPEN', 'CAMPAIGN_PRICE_INVALID', 'CAMPAIGN_PRICE_RAISED', 'CAMPAIGN_REASON_REQUIRED',
    'CAMPAIGN_SERVICE_REQUIRED', 'CAMPAIGN_SLUG_INVALID', 'CAMPAIGN_SLUG_TAKEN', 'CAMPAIGN_STALE',
    'CAMPAIGN_STATUS_INVALID', 'CAMPAIGN_TEXT_INVALID', 'CATALOG_FILTERS_INVALID', 'CATALOG_REVIEW_AI_MISMATCH',
    'CATALOG_REVIEW_FILTER_INVALID', 'CATALOG_REVIEW_NOT_FOUND', 'CATALOG_REVIEW_SOURCE_INVALID',
    'CATALOG_REVIEW_VARIANT_NAME_REQUIRED', 'CATALOG_REVIEW_VERDICT_INVALID', 'CODE128_UNSUPPORTED',
    'COLLECTION_DATES_INVALID', 'COLLECTION_INTRO_INVALID', 'COLLECTION_NOT_FOUND', 'COLLECTION_SETS_INVALID',
    'COLLECTION_SLUG_INVALID', 'COLLECTION_SLUG_TAKEN', 'COLLECTION_TITLE_INVALID', 'COMPANIONS_INVALID',
    'COMPLAINT_ANSWER_INVALID', 'COMPLAINT_DECLARATION_REQUIRED', 'COMPLAINT_INVALID', 'COMPLAINT_NOT_ANSWERABLE',
    'COMPLAINT_RATE_LIMITED', 'CONSIGNMENT_ACTIVE', 'CONSIGNMENT_INVITE_INVALID', 'CONSIGNMENT_NOT_ENABLED',
    'CONSIGNMENT_NOT_FOUND', 'CONSIGNMENT_OWN_STORE', 'CONSIGNMENT_STOCK_MANAGED', 'COUNTER_AUTH_REQUIRED',
    'COUNTER_CODE_EXPIRED', 'COUNTER_CODE_INVALID', 'COUNTER_CODE_LIMIT', 'COUNTER_CODE_USED', 'COUNTER_DAILY_LIMIT',
    'COUNTER_OWN_STORE', 'COUNTER_SALE_CLAIMED', 'COUNTER_SALE_CONFIRMED', 'COUNTER_SALE_EXPIRED',
    'COUNTER_SALE_NOT_FOUND', 'COUNTER_SALE_UNDONE', 'COUNTER_STORE_DAILY_LIMIT', 'COUNTER_STORE_NOT_ACTIVE',
    'Client cannot emit lifecycle events.', 'DEALER_ALREADY_OPEN', 'DEALER_BRAND_INVALID', 'DEALER_DECISION_INVALID',
    'DEALER_DOCUMENT_INVALID', 'DEALER_LIMIT', 'DEALER_NOTE_INVALID', 'DEALER_NOT_FOUND', 'DEALER_REASON_INVALID',
    'DEALER_REASON_REQUIRED', 'DEALER_SERVICE_REQUIRED', 'DEALER_STALE', 'DEALER_STATUS_INVALID',
    'DEALER_VALID_UNTIL_INVALID', 'DELETE_AUTH_REQUIRED', 'DELETE_SERVICE_REQUIRED', 'DEMAND_REPORT_FORBIDDEN',
    'DEMAND_REPORT_MONTH_INVALID', 'DEMAND_REPORT_SERVICE_REQUIRED', 'DEMAND_REPORT_STORE_REQUIRED',
    'DEVICE_AUTH_REQUIRED', 'DEVICE_INVALID', 'EINVOICE_NOT_CONNECTED', 'EINVOICE_NUMBER_INVALID',
    'EINVOICE_NUMBER_USED', 'EINVOICE_SETTINGS_INVALID', 'EINVOICE_TOKEN_REQUIRED', 'EMAIL_ACTION_INVALID',
    'EMAIL_BASE_URL_INVALID', 'EMAIL_BASE_URL_MISSING', 'EMAIL_CLAIM_FAILED', 'EMAIL_CLAIM_OUTDATED',
    'EMAIL_DAILY_WINDOW_INVALID', 'EMAIL_DATABASE_CONFIG_MISSING', 'EMAIL_DELIVERY_CLAIM_INVALID',
    'EMAIL_DESTINATION_INVALID', 'EMAIL_DIGEST_PREPARE_FAILED', 'EMAIL_EMPTY_DIGEST', 'EMAIL_FAILURE_INVALID',
    'EMAIL_PREFERENCES_AUTH_REQUIRED', 'EMAIL_PREFERENCES_INVALID', 'EMAIL_PROVIDER_ID_INVALID',
    'EMAIL_SERVICE_REQUIRED', 'EMAIL_TEMPLATE_UNSUPPORTED', 'EMAIL_WEEKLY_PREPARE_FAILED',
    'EMAIL_WEEKLY_WINDOW_INVALID', 'EVENT_BATCH_INVALID', 'EXPORT_AUTH_REQUIRED', 'El envío ya está en curso.',
    'El proveedor no devolvió un identificador.', 'El proveedor rechazó el envío.',
    'El sonido no se subió. Reintenta o quítalo.', 'Esta foto es demasiado pesada. Prueba con otra.',
    'Event configuration unavailable.', 'Event/session identity required.', 'Events unavailable.',
    'FAVORITE_AUTH_REQUIRED', 'FAVORITE_INVALID', 'FAVORITE_NOTE_TOO_LONG', 'FAVORITE_NOT_FOUND',
    'FAVORITE_PAGE_INVALID', 'FAVORITE_SELF_NOT_ALLOWED', 'FAVORITE_UNAVAILABLE', 'FEED_INVALID',
    'FINGERPRINT_INVALID', 'FINGERPRINT_LISTING_NOT_FOUND', 'FINGERPRINT_SERVICE_REQUIRED', 'FOLLOW_AUTH_REQUIRED',
    'FOLLOW_INVALID', 'FOLLOW_SELF_NOT_ALLOWED', 'FOLLOW_UNAVAILABLE', 'FOREIGN_KEY_INDEX_TABLES_BUSY',
    'Falta la configuración del proveedor de correo.', 'GEAR_BRAND_REQUIRED', 'GEAR_CATEGORY_INVALID',
    'GEAR_DATE_INVALID', 'GEAR_INVALID', 'GEAR_LIMIT', 'GEAR_MODEL_TOO_LONG', 'GEAR_NOTE_TOO_LONG', 'GEAR_NOT_FOUND',
    'GEAR_PARTICULAR_ONLY', 'GEAR_PURCHASE_DATE_INVALID', 'GEAR_REMINDER_DATE_INVALID',
    'GEAR_REMINDER_INTERVAL_INVALID', 'GEAR_REMINDER_NOT_APPLICABLE', 'GEAR_REMINDER_NOT_FOUND',
    'GEAR_SERIAL_TOO_LONG', 'GEAR_WARRANTY_DATE_INVALID', 'GIFT_DAYS_INVALID', 'GIFT_NOTE_LENGTH',
    'HELP_ANSWER_INVALID', 'HELP_AUTH_REQUIRED', 'HELP_STATUS_INVALID', 'HELP_TICKET_INVALID', 'HELP_TICKET_NOT_FOUND',
    'HELP_TICKET_RATE_LIMITED',
    'Hiciste muchos cambios de fotos en esta publicación. Guarda el borrador y empieza una nueva.',
    'IDEMPOTENCY_KEY_INVALID', 'IDEMPOTENCY_KEY_REUSED', 'IMPORT_ALREADY_OPEN', 'IMPORT_BUSY', 'IMPORT_CELL_INVALID',
    'IMPORT_CSV_UNCLOSED_QUOTE', 'IMPORT_DUPLICATE_SKU', 'IMPORT_FIELDS_INVALID', 'IMPORT_FIELD_INVALID',
    'IMPORT_FILE_CHANGED', 'IMPORT_FILE_EMPTY', 'IMPORT_FILE_INVALID', 'IMPORT_FILE_MISSING',
    'IMPORT_FILE_TOO_BIG_UNCOMPRESSED', 'IMPORT_FILE_TOO_LARGE', 'IMPORT_FORBIDDEN', 'IMPORT_FORMAT_MISMATCH',
    'IMPORT_FORMAT_UNSUPPORTED', 'IMPORT_ITEM_ARCHIVED', 'IMPORT_LEASE_LOST', 'IMPORT_LISTING_CLOSED',
    'IMPORT_LISTING_INVALID', 'IMPORT_LISTING_NOT_OWNED', 'IMPORT_MAPPING_INVALID', 'IMPORT_MAPPING_KEY_REQUIRED',
    'IMPORT_MAPPING_LOCKED', 'IMPORT_MAPPING_PRICE_REQUIRED', 'IMPORT_MAPPING_STOCK_REQUIRED', 'IMPORT_NAME_INVALID',
    'IMPORT_NAME_REQUIRED', 'IMPORT_NOTHING_TO_APPLY', 'IMPORT_PHOTOS_CLOSED', 'IMPORT_PHOTO_LIMIT',
    'IMPORT_PHOTO_NOT_FOUND', 'IMPORT_PHOTO_ORDER_STALE', 'IMPORT_PHOTO_REQUEST_INVALID', 'IMPORT_PHOTO_ROW_FULL',
    'IMPORT_PHOTO_ROW_NOT_FOUND', 'IMPORT_PHOTO_TOO_LARGE', 'IMPORT_PHOTO_TYPE', 'IMPORT_PRICE_IGNORED',
    'IMPORT_PRICE_INVALID', 'IMPORT_PUBLICATION_MISSING', 'IMPORT_PUBLISH_CLOSED', 'IMPORT_PUBLISH_INCOMPLETE',
    'IMPORT_PUBLISH_PHOTOS', 'IMPORT_PUBLISH_REQUEST_INVALID', 'IMPORT_PUBLISH_RULES_REQUIRED',
    'IMPORT_PUBLISH_STORE_INELIGIBLE', 'IMPORT_ROWS_INCOMPLETE', 'IMPORT_ROWS_INVALID', 'IMPORT_ROWS_PENDING',
    'IMPORT_ROW_APPLIED', 'IMPORT_ROW_NOT_FOUND', 'IMPORT_ROW_PUBLISHED', 'IMPORT_SCOPE_INVALID',
    'IMPORT_SESSION_CLOSED', 'IMPORT_SESSION_NOT_FOUND', 'IMPORT_SHEET_MISSING', 'IMPORT_SKU_ALREADY_LINKED',
    'IMPORT_SKU_GENERATED', 'IMPORT_SKU_INVALID', 'IMPORT_SKU_LISTING_MISMATCH', 'IMPORT_STATE_INVALID',
    'IMPORT_STOCK_BLANK', 'IMPORT_STOCK_IGNORED', 'IMPORT_STOCK_INVALID', 'IMPORT_STOCK_KEPT', 'IMPORT_STOCK_REQUIRED',
    'IMPORT_STOCK_STALE', 'IMPORT_STOCK_STALE_APPLIED', 'IMPORT_THRESHOLD_INVALID', 'IMPORT_TOO_MANY_COLUMNS',
    'IMPORT_TOO_MANY_ROWS', 'IMPORT_UNAVAILABLE', 'IMPORT_VERSION_CONFLICT', 'IMPORT_XLSX_MACROS',
    'IMPORT_XLS_UNSUPPORTED', 'INVENTORY_ALREADY_ENABLED', 'INVENTORY_ARCHIVE_BLOCKED',
    'INVENTORY_ARRIVAL_DATE_INVALID', 'INVENTORY_ARRIVAL_INVALID', 'INVENTORY_BULK_INVALID',
    'INVENTORY_CAMPAIGN_NOT_FOUND', 'INVENTORY_CATALOG_INVALID', 'INVENTORY_CATEGORY_INVALID',
    'INVENTORY_CONCURRENT_CHANGE', 'INVENTORY_FIELD_INVALID', 'INVENTORY_FIELD_NOT_ALLOWED',
    'INVENTORY_FILTER_INVALID', 'INVENTORY_ITEM_ALREADY_LINKED', 'INVENTORY_ITEM_ARCHIVED',
    'INVENTORY_ITEM_NOT_LINKED', 'INVENTORY_ITEM_NOT_OWNED', 'INVENTORY_LEDGER_APPEND_ONLY',
    'INVENTORY_LISTING_ALREADY_LINKED', 'INVENTORY_LISTING_INVALID', 'INVENTORY_MANAGED_LISTING',
    'INVENTORY_NOT_ENABLED', 'INVENTORY_PRICE_CHOICE_REQUIRED', 'INVENTORY_PRICE_INVALID', 'INVENTORY_PRICE_MISSING',
    'INVENTORY_PUBLISH_NONE', 'INVENTORY_REASON_REQUIRED', 'INVENTORY_SERIAL_FORBIDDEN', 'INVENTORY_SERIAL_INVALID',
    'INVENTORY_SKU_INVALID', 'INVENTORY_SKU_TAKEN', 'INVENTORY_STORE_READ_ONLY', 'INVENTORY_STORE_REQUIRED',
    'INVENTORY_VERSION_CONFLICT', 'INVENTORY_VERSION_REQUIRED', 'INVENTORY_VIEWS_FULL',
    'Indica el límite diario (0 a 1000000) y el motivo.', 'Indica si el piloto queda activo y el motivo.',
    'Invalid analytics period.', 'Invalid authenticated actor.', 'Invalid cleanup scope.', 'Invalid draft photo.',
    'Invalid draft sound clip.', 'Invalid event source.', 'Invalid limit.', 'Invalid listing attribution.',
    'Invalid paths.', 'Invalid purchase intent.', 'Invalid search metadata.', 'Invalid store attribution.',
    'Invalid submission kind', 'LEGACY_LINK_NOTE_REQUIRED', 'LEGACY_LISTING_ALREADY_LINKED',
    'LEGACY_LISTING_NOT_ELIGIBLE', 'LEGACY_OWNER_NOT_ELIGIBLE', 'LISTING_APPROVAL_INVALID',
    'LISTING_ATTRIBUTES_INVALID', 'LISTING_AVAILABILITY_INVALID', 'LISTING_BULK_INVALID', 'LISTING_CLOSED',
    'LISTING_CONDITION_INVALID', 'LISTING_COPY_INVALID', 'LISTING_COPY_MODE_INVALID', 'LISTING_DESCRIPTION_INVALID',
    'LISTING_DETAILS_INVALID', 'LISTING_DRAFT_ALREADY_PUBLISHED', 'LISTING_DRAFT_LIMIT',
    'LISTING_EDIT_FIELD_NOT_ALLOWED', 'LISTING_EDIT_INVALID', 'LISTING_EDIT_RETRY_CHANGED', 'LISTING_FIELD_REQUIRED',
    'LISTING_HIDE_INVALID', 'LISTING_HIDE_REASON_REQUIRED', 'LISTING_LIFECYCLE_ACTION_INVALID', 'LISTING_NOT_EDITABLE',
    'LISTING_NOT_FOUND', 'LISTING_NOT_OWNED', 'LISTING_PAUSE_INVALID', 'LISTING_PHOTO_COUNT_INVALID',
    'LISTING_PHOTO_INVALID', 'LISTING_PRICE_INVALID', 'LISTING_REJECTION_CODE_INVALID',
    'LISTING_REJECTION_REASON_REQUIRED', 'LISTING_RELIST_INVALID', 'LISTING_REQUIREMENTS_INVALID',
    'LISTING_RESTORE_INVALID', 'LISTING_REVIEW_ACTION_INVALID', 'LISTING_REVISION_ALREADY_PENDING',
    'LISTING_REVISION_NOT_PENDING', 'LISTING_REVISION_REJECTION_REASON_REQUIRED', 'LISTING_REVISION_REQUIRED_FIELD',
    'LISTING_REVISION_REVIEW_INVALID', 'LISTING_REVISION_STALE', 'LISTING_SERIAL_FORBIDDEN', 'LISTING_SERIAL_INVALID',
    'LISTING_SOLD_INVALID', 'LISTING_TAXONOMY_INVALID', 'LISTING_WITHDRAW_INVALID', 'Legacy view counter is disabled.',
    'Listing does not meet publication requirements.', 'Listing not found.', 'Listing not owned.',
    'MADE_TO_ORDER_INVALID', 'MAKER_CITY_REQUIRED', 'MAKER_HIDDEN', 'MAKER_INVALID', 'MAKER_REQUIRED',
    'MAKER_STATUS_UNCHANGED', 'MAKER_STORY_LENGTH', 'MAKER_YEAR_INVALID', 'MERCADOLIBRE_AUTH', 'MERCADOLIBRE_BUSY',
    'MERCADOLIBRE_IMPORT_NOT_FOUND', 'MERCADOLIBRE_OFF', 'MERCADOLIBRE_PHOTOS_INVALID', 'MERCADOLIBRE_SELECTION_EMPTY',
    'MERCADOLIBRE_SERVICE_REQUIRED', 'MERCADOLIBRE_TOKEN_INVALID', 'MERCADOLIBRE_UNAVAILABLE',
    'Marketplace account context required.', 'Marketplace rules acceptance is required.', 'NOTIFICATION_AUTH_REQUIRED',
    'NOTIFICATION_EVENT_INVALID', 'NOTIFICATION_NOT_OWNED', 'No freeform event metadata allowed.',
    'No pudimos preparar esta foto en tu navegador. Prueba con otra o tómala de nuevo.',
    'No se pudieron subir las fotos. Reintenta sin cerrar esta página.',
    'No se pudo completar la limpieza segura de las fotos. Intenta nuevamente.',
    'No se pudo preparar el intento de guardado.', 'No se pudo preparar la subida segura de fotos.',
    'No se pudo subir una de las fotos.', 'No se pudo subir. Toca Reintentar.',
    'No supimos si el envío anterior llegó. Deja los datos como estaban y toca Publicar para confirmarlo.',
    'Not allowed.', 'Only a draft or pending listing can be submitted.',
    'Only a draft, rejected, or pending listing can be submitted.',
    'Only a rejected store application can be resubmitted.', 'Only admin can change profile account type.',
    'Only admin can change when a profile was created.',
    'Only admin or controlled server functions can change protected listing fields.',
    'Only admin or controlled server functions can change protected store fields.',
    'Only an active Tienda can be verified.', 'Only controlled server functions can change protected listing fields.',
    'Only controlled server functions can change protected store fields.', 'PAGE_INVALID', 'PAGE_REFRESH_TABLES_BUSY',
    'PAYMENT_DECISION_INVALID', 'PAYMENT_HOLDER_REQUIRED', 'PAYMENT_INSTALLMENTS_CARDS_INVALID',
    'PAYMENT_INSTALLMENTS_CARD_REQUIRED', 'PAYMENT_INSTALLMENTS_CHANGED', 'PAYMENT_INSTALLMENTS_COUNT',
    'PAYMENT_INSTALLMENTS_INTEREST_FREE', 'PAYMENT_INSTALLMENTS_MIN_PRICE', 'PAYMENT_INSTALLMENTS_NOT_APPROVED',
    'PAYMENT_INSTALLMENTS_NOT_FOUND', 'PAYMENT_INSTALLMENTS_NOT_PENDING', 'PAYMENT_METHOD_CHANGED',
    'PAYMENT_METHOD_HISTORY_APPEND_ONLY', 'PAYMENT_METHOD_INVALID', 'PAYMENT_METHOD_NOT_APPROVED',
    'PAYMENT_METHOD_NOT_FOUND', 'PAYMENT_METHOD_NOT_PENDING', 'PAYMENT_METHOD_SENSITIVE_DATA',
    'PAYMENT_METHOD_TEXT_INVALID', 'PAYMENT_METHOD_TEXT_LENGTH', 'PAYMENT_PILOT_OFF', 'PAYMENT_PROVIDER_INVALID',
    'PAYMENT_REASON_REQUIRED', 'PAYMENT_STORE_NOT_VERIFIED', 'PAYMENT_STORE_REQUIRED', 'PHOTO_DIMENSIONS',
    'PHOTO_INVALID', 'PHOTO_TOO_LARGE', 'PHOTO_TYPE_MISMATCH', 'POLICY_TABLES_BUSY', 'PRICE_STEPS_FLOOR_INVALID',
    'PRICE_STEPS_FLOOR_TOO_LOW', 'PRICE_STEPS_NOT_FOUND', 'PRICE_STEPS_NOT_PUBLIC', 'PRICE_STEPS_PACE_INVALID',
    'PRICE_STEPS_STOCK_MANAGED', 'PRIVACY_TABLES_BUSY', 'PRIVATE_OFFER_DAYS_INVALID', 'PRIVATE_OFFER_MESSAGE_INVALID',
    'PRIVATE_OFFER_NOT_PUBLIC', 'PRIVATE_OFFER_NO_AUDIENCE', 'PRIVATE_OFFER_PRICE_INVALID',
    'PRIVATE_OFFER_PRICE_TOO_LOW', 'PRIVATE_OFFER_TOO_SOON', 'PROVENANCE_ALREADY_RESOLD', 'PROVENANCE_LISTING_INVALID',
    'PROVENANCE_LISTING_TAKEN', 'PROVENANCE_TRANSACTION_INVALID', 'PURCHASE_REQUEST_NOT_FOUND',
    'PURCHASE_REQUEST_NO_SKU', 'PURCHASE_REQUEST_SOLD', 'PUSH_AUTH_REQUIRED', 'PUSH_CLAIM_FAILED',
    'PUSH_CONFIG_INVALID', 'PUSH_DELIVERY_CLAIM_INVALID', 'PUSH_ENDPOINT_UNSUPPORTED', 'PUSH_KEYS_INVALID',
    'PUSH_NOTICES_EMPTY', 'PUSH_OUTCOME_INVALID', 'PUSH_SERVICE_REQUIRED', 'PUSH_WORKER_MISSING',
    'PUSH_WORKER_TIMEOUT', 'Pending inventory contains a listing that cannot be published.',
    'Proveedor de correo no compatible.', 'QR_TOO_LONG', 'QUESTION_ADMIN_REQUIRED', 'QUESTION_ALREADY_ANSWERED',
    'QUESTION_ANSWER_FORBIDDEN', 'QUESTION_ANSWER_LENGTH', 'QUESTION_AUTH_REQUIRED', 'QUESTION_CONTACT_DETAILS',
    'QUESTION_DAILY_LIMIT', 'QUESTION_LENGTH', 'QUESTION_LISTING_UNAVAILABLE', 'QUESTION_NOT_FOUND',
    'QUESTION_OWN_LISTING', 'QUESTION_PENDING_LIMIT', 'QUESTION_REASON_REQUIRED', 'QUESTION_STATUS_UNCHANGED',
    'RATE_LIMIT_INVALID', 'REASON_REQUIRED', 'RECEIPT_ADDRESS', 'RECEIPT_DNI', 'RECEIPT_DOCUMENT',
    'RECEIPT_DOCUMENT_REQUIRED', 'RECEIPT_EMAIL', 'RECEIPT_FACTURA', 'RECEIPT_INVALID', 'RECEIPT_KIND', 'RECEIPT_NAME',
    'RECEIPT_NOT_FOUND', 'RECEIPT_PRICE', 'RECEIPT_RESULT_INVALID', 'RECEIPT_RUC', 'RECEIPT_SALE_NOT_FOUND',
    'RECEIPT_STORE_NOT_VERIFIED', 'RECEIPT_VOID_EXPIRED', 'RECEIPT_VOID_NOT_ALLOWED', 'RECEIPT_VOID_REASON',
    'RECOVERY_RATE_LIMITED', 'RED_FLAG_NOT_OPEN', 'RED_FLAG_STATUS_INVALID', 'REPORT_ALREADY_CLOSED',
    'REPORT_ALREADY_SUBMITTED', 'REPORT_AUTH_REQUIRED', 'REPORT_DETAIL_TOO_LONG', 'REPORT_NOT_FOUND',
    'REPORT_REASON_INVALID', 'REPORT_RESOLUTION_REASON_REQUIRED', 'REPORT_REVIEW_NOT_VISIBLE', 'REPORT_STATUS_INVALID',
    'REPORT_TARGET_UNAVAILABLE', 'REPUTATION_TARGET_INVALID', 'REQUEST_INVALID', 'REQUEST_NOT_FOUND',
    'REVIEW_ALREADY_SUBMITTED', 'REVIEW_AUTH_REQUIRED', 'REVIEW_COMMENT_TOO_LONG', 'REVIEW_HIDDEN',
    'REVIEW_MODERATION_REASON_REQUIRED', 'REVIEW_NOT_FOUND', 'REVIEW_PARTICIPANT_REQUIRED', 'REVIEW_PHOTO',
    'REVIEW_PHOTO_BUYER_ONLY', 'REVIEW_PHOTO_LIMIT', 'REVIEW_PHOTO_NOT_FOUND', 'REVIEW_PHOTO_PATH_INVALID',
    'REVIEW_PHOTO_REASON_REQUIRED', 'REVIEW_PHOTO_REVIEW_INVALID', 'REVIEW_PHOTO_STATUS_INVALID',
    'REVIEW_PHOTO_UPLOAD_MISSING', 'REVIEW_PHOTO_WINDOW_CLOSED', 'REVIEW_RATING_INVALID', 'REVIEW_TRANSACTION_INVALID',
    'REVIEW_WINDOW_CLOSED', 'Reintenta con los mismos datos y fotos para confirmar el envío anterior.',
    'SAFE_SPOT_ADMIN_DISABLED', 'SAFE_SPOT_NOTE_INVALID', 'SAFE_SPOT_NOT_ELIGIBLE', 'SAFE_SPOT_REASON_REQUIRED',
    'SAFE_SPOT_STORE_REQUIRED', 'SAFE_SPOT_VALUE_INVALID', 'SALE_TERMS_CONTACT_DETAILS', 'SALE_TERMS_INVALID',
    'SELLER_PAGE_NOT_FOUND', 'SELLER_PAGE_VALUE_INVALID', 'SERVICE_ADMIN_REQUIRED', 'SERVICE_AREAS_INVALID',
    'SERVICE_AUTH_REQUIRED', 'SERVICE_BOOKING_ANSWERED', 'SERVICE_BOOKING_DECLINED', 'SERVICE_BOOKING_EXISTS',
    'SERVICE_BOOKING_EXPIRED', 'SERVICE_BOOKING_FORBIDDEN', 'SERVICE_BOOKING_LIMIT', 'SERVICE_BOOKING_NOT_FOUND',
    'SERVICE_CATEGORY_FIXED', 'SERVICE_CATEGORY_INVALID', 'SERVICE_CATEGORY_TAKEN', 'SERVICE_CITY_REQUIRED',
    'SERVICE_COMMENT_LENGTH', 'SERVICE_CONTACT_DETAILS', 'SERVICE_CONTACT_REQUIRED', 'SERVICE_DECISION_INVALID',
    'SERVICE_DESCRIPTION_LENGTH', 'SERVICE_DISTRICT_INVALID', 'SERVICE_HAS_HISTORY', 'SERVICE_INVALID',
    'SERVICE_MODALITY_INVALID', 'SERVICE_NOT_BOOKABLE', 'SERVICE_NOT_FOUND', 'SERVICE_OWN_SERVICE',
    'SERVICE_PHONE_INVALID', 'SERVICE_PHOTOS_INVALID', 'SERVICE_PRICE_INVALID', 'SERVICE_PROFILE_REQUIRED',
    'SERVICE_PROVIDER_LENGTH', 'SERVICE_RATING_INVALID', 'SERVICE_REASON_REQUIRED', 'SERVICE_REGION_INVALID',
    'SERVICE_REPORT_ALREADY_SUBMITTED', 'SERVICE_REPORT_AUTH_REQUIRED', 'SERVICE_REPORT_DETAIL_TOO_LONG',
    'SERVICE_REPORT_NOT_FOUND', 'SERVICE_REPORT_REASON_INVALID', 'SERVICE_REPORT_TARGET_UNAVAILABLE',
    'SERVICE_REQUIRED', 'SERVICE_REVIEW_CLOSED', 'SERVICE_REVIEW_EXISTS', 'SERVICE_REVIEW_LOCKED',
    'SERVICE_REVIEW_NOT_FOUND', 'SERVICE_SERVICE_REQUIRED', 'SERVICE_SKILLS_INVALID', 'SERVICE_STALE',
    'SERVICE_STATUS_INVALID', 'SERVICE_STORE_REQUIRED', 'SERVICE_TITLE_LENGTH', 'SERVICE_UNIT_INVALID',
    'SESSIONS_AUTH_REQUIRED', 'SESSION_INVALID', 'SESSION_IS_CURRENT', 'SESSION_REVOKE_UNAVAILABLE',
    'SOLD_LISTING_IMMUTABLE', 'STOCK_CHANNEL_INVALID', 'STOCK_INSUFFICIENT', 'STOCK_MOVEMENT_TYPE_INVALID',
    'STOCK_QUANTITY_INVALID', 'STOCK_UNDO_DONE', 'STOCK_UNDO_EXPIRED', 'STOCK_UNDO_INSUFFICIENT',
    'STOCK_UNDO_NOT_ALLOWED', 'STOCK_UNDO_NOT_FOUND', 'STOCK_WATCH_AUTH_REQUIRED', 'STOCK_WATCH_OWN_LISTING',
    'STOCK_WATCH_UNAVAILABLE', 'STOLEN_AUTH_REQUIRED', 'STOLEN_MATCH_NOT_PENDING', 'STOLEN_PHOTOS_INVALID',
    'STOLEN_RATE_LIMITED', 'STOLEN_REASON_REQUIRED', 'STOLEN_REPORT_INVALID', 'STOLEN_REPORT_NOT_ACTIVE',
    'STOLEN_REPORT_NOT_FOUND', 'STOLEN_SERIAL_INVALID', 'STOLEN_SERIAL_OR_PHOTO_REQUIRED', 'STOLEN_SOURCE_INVALID',
    'STOLEN_STATUS_INVALID', 'STORE_ALLOWANCE_INVALID', 'STORE_ALLOWANCE_REASON_REQUIRED',
    'STORE_APPLICATION_INCOMPLETE', 'STORE_IMAGE_URL_INVALID', 'STORE_INVENTORY_LIMIT_REACHED',
    'STORE_LOCATION_ADDRESS', 'STORE_LOCATION_INVALID', 'STORE_LOCATION_LIMIT', 'STORE_LOCATION_MOVE_TO',
    'STORE_LOCATION_NAME', 'STORE_LOCATION_NAME_TAKEN', 'STORE_LOCATION_NOT_FOUND', 'STORE_LOCATION_PLACE',
    'STORE_LOCATION_STOCK_MISMATCH', 'STORE_LOCATION_STOCK_SHORT', 'STORE_LOCATION_TRANSFER_SAME',
    'STORE_MAP_PIN_INVALID', 'STORE_NOT_ACTIVE', 'STORE_NOT_ELIGIBLE', 'STORE_NOT_FOUND', 'STORE_NOT_OWNED',
    'STORE_NOT_PUBLIC', 'STORE_NOT_VERIFIED', 'STORE_NOT_WRITABLE', 'STORE_REQUIRED', 'STORE_TERMS_INVALID',
    'STORE_TERMS_LISTING_NOT_OWNED', 'STORE_TERMS_LISTING_SOLD', 'STORE_TERMS_NOTE_LENGTH', 'STORE_TERMS_READ_ONLY',
    'STORE_TERMS_RETURNS_RANGE', 'STORE_TERMS_STORE_REQUIRED', 'STORE_TERMS_WARRANTY_RANGE',
    'Se cortó la conexión. Toca Reintentar.', 'Search has no seller target.', 'Seller account required.',
    'Separate new Store Owner application required.', 'Service access required.', 'Service read failed',
    'Session unavailable.', 'Sprint 2 migration blocked: a Store Owner is linked to multiple stores.',
    'Sprint 2 migration blocked: a store exceeds the V1 concurrent inventory cap.',
    'Sprint 2 migration blocked: an existing store has an invalid RUC.',
    'Sprint 2 migration blocked: duplicate normalized RUC values exist.', 'Store application is incomplete.',
    'Store application required.', 'Store inventory requires its authenticated owner and an eligible application.',
    'Store listings require an approved store membership.', 'Store not found.', 'Supabase is not configured',
    'Supabase unavailable', 'TRACK_RECORD_VALUE_INVALID', 'TRADE_ALREADY_SENT', 'TRADE_AMOUNT_INVALID',
    'TRADE_BRAND_REQUIRED', 'TRADE_CATEGORIES_INVALID', 'TRADE_CATEGORIES_REQUIRED', 'TRADE_CATEGORY_INVALID',
    'TRADE_CATEGORY_NOT_BOUGHT', 'TRADE_CONDITION_REQUIRED', 'TRADE_CONSUMABLES_INVALID', 'TRADE_CONTACT_DETAILS',
    'TRADE_DESCRIPTION_LENGTH', 'TRADE_INVALID', 'TRADE_LISTING_INVALID', 'TRADE_NOTE_INVALID', 'TRADE_NOT_ACCEPTED',
    'TRADE_NOT_FOUND', 'TRADE_NO_STORES', 'TRADE_OFFERS_CLOSED', 'TRADE_OFFER_CLOSED', 'TRADE_OFFER_NOT_FOUND',
    'TRADE_OPEN_LIMIT', 'TRADE_OWN_STORE', 'TRADE_PHONE_REQUIRED', 'TRADE_PHOTOS_REQUIRED', 'TRADE_PHOTO_MISSING',
    'TRADE_PRICE_INVALID', 'TRADE_RATE_LIMIT', 'TRADE_REGION_REQUIRED', 'TRADE_STORE_NOT_ELIGIBLE',
    'TRANSACTION_ALREADY_VERIFIED', 'TRANSACTION_AUTH_REQUIRED', 'TRANSACTION_BUYER_NOT_ELIGIBLE',
    'TRANSACTION_CLAIM_FINAL', 'TRANSACTION_CLAIM_NOT_OWNED', 'TRANSACTION_LISTING_NOT_OWNED',
    'TRANSACTION_LISTING_NOT_SOLD', 'TRANSACTION_NOT_ACCESSIBLE', 'TRANSACTION_RESPONSE_INVALID',
    'TRYOUT_ALREADY_BOOKED', 'TRYOUT_AUTH_REQUIRED', 'TRYOUT_HOURS_INVALID', 'TRYOUT_HOURS_REQUIRED', 'TRYOUT_INVALID',
    'TRYOUT_LIMIT', 'TRYOUT_NAME_INVALID', 'TRYOUT_NOTE_LENGTH', 'TRYOUT_NOT_CANCELLABLE', 'TRYOUT_NOT_FOUND',
    'TRYOUT_NOT_PENDING', 'TRYOUT_OWN_LISTING', 'TRYOUT_PHONE_INVALID', 'TRYOUT_REASON_LENGTH',
    'TRYOUT_SETTINGS_INVALID', 'TRYOUT_SLOT_INVALID', 'TRYOUT_SLOT_TAKEN', 'TRYOUT_STORE_READ_ONLY',
    'TRYOUT_STORE_REQUIRED', 'TRYOUT_UNAVAILABLE', 'TWO_STEP_AUTH_REQUIRED', 'TWO_STEP_REQUIRED',
    'The buyer card could not be read', 'The counter purchase could not be read', 'The home feed could not be read.',
    'The listing could not be checked', 'The listing could not be read', 'The listing''s address could not be read',
    'The seller page could not be read', 'The sitemap''s collections could not be read',
    'The sitemap''s listings could not be read', 'The sitemap''s services could not be read',
    'The sitemap''s stores could not be read', 'The store could not be read',
    'Tu sesión terminó. Vuelve a ingresar para seguir subiendo fotos.', 'Tu sesión venció. Ingresa nuevamente.',
    'UPLOAD_REMOVED', 'Una foto no se subió. Toca Reintentar en la foto o quítala.', 'Unsupported seller type.',
    'Unsupported store decision.', 'Usa fotos en JPG, PNG o WebP.', 'Usa una foto JPG, PNG o WEBP.',
    'You cannot publish this listing.', 'You cannot submit this listing.', 'You cannot submit this store inventory.',
    'cards', 'feed page failed', 'listing_matches_saved_search: brand clause not found', 'load',
    'marketplace_email_context_check not readable', 'no canvas', 'no rows',
    'normalize_saved_search: the category or attribute list moved; update 20261207120000_feat_discovery.sql',
    'notifications_target_check not found', 'notifications_target_check not readable', 'the facet counts failed',
    'the facet counts were malformed', 'the rescue count failed', 'the rescue reads failed', 'too short', 'type',
    'unsupported', 'writeXlsx needs at least one sheet',
    'write_listing_sale_terms changed: the trade categories check was not found exactly once'
  ]::text[];
$$;

-- A known message's kept form (laria_private.app_error_messages): the first whose pattern matches the line, or null.
create or replace function laria_private.app_error_known_message(p_line text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(p_line, template.pattern || '.*$', template.message)
  from laria_private.app_error_messages() template
  where p_line ~ template.pattern
  order by template.ordinal
  limit 1;
$$;

-- What an error's message is kept as, from the server or a browser. The message is read as one line (NFKC, any kind of
-- space or line break as one space), without "Uncaught ", an error name in front, or a database code a browser added
-- at the end ("… (PGRST301)"). Then: one of the site's own messages as written; one of them followed by ':' as that
-- part, then ': ' and the rest only when it is one of the site's own or a known message, otherwise …; a known message;
-- or "Otro mensaje (no se guarda el texto)".
create or replace function laria_private.app_error_message(p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  with given as (
    select regexp_replace(regexp_replace(regexp_replace(trim(regexp_replace(normalize(left(coalesce(p_message, ''), 2000), NFKC),
      '[\s\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g')),
      '^Uncaught (\(in promise\) )?', ''), '^[A-Za-z]{0,40}(Error|Exception): ', ''),
      ' \((PGRST[0-9]{3}|[0-9A-Z]{5})\)$', '') as line
  ), own as (
    select unnest(laria_private.app_error_own_messages()) as message
  )
  select coalesce(
    (select own.message from own, given where own.message = given.line),
    (select own.message || ': ' || coalesce(
        (select rest_own.message from own rest_own where rest_own.message = rest.line),
        laria_private.app_error_known_message(rest.line), '…')
     from own, given, lateral (select ltrim(substr(given.line, length(own.message) + 2)) as line) rest
     where left(given.line, length(own.message) + 1) = own.message || ':'
     order by length(own.message) desc
     limit 1),
    laria_private.app_error_known_message((select given.line from given)),
    'Otro mensaje (no se guarda el texto)');
$$;

-- An error's name: one of JavaScript's or the DOM's own, or on the server also a class of the app's own whose name ends
-- in Error or Exception (AuthApiError). Anything else reads Error, so a made-up report can't carry a name.
create or replace function laria_private.app_error_name(p_source text, p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name = any (array['Error', 'AggregateError', 'EvalError', 'InternalError', 'RangeError', 'ReferenceError',
      'SyntaxError', 'TypeError', 'URIError', 'DOMException', 'AbortError', 'ChunkLoadError', 'ConstraintError',
      'DataCloneError', 'DataError', 'EncodingError', 'HierarchyRequestError', 'IndexSizeError', 'InvalidAccessError',
      'InvalidCharacterError', 'InvalidModificationError', 'InvalidNodeTypeError', 'InvalidStateError', 'NamespaceError',
      'NetworkError', 'NoModificationAllowedError', 'NotAllowedError', 'NotFoundError', 'NotReadableError',
      'NotSupportedError', 'OperationError', 'OverconstrainedError', 'QuotaExceededError', 'ReadOnlyError',
      'SecurityError', 'TimeoutError', 'TransactionInactiveError', 'UnknownError', 'VersionError', 'WrongDocumentError'])
      then p_name
    when p_source = 'server' and p_name ~ '^[A-Z][A-Za-z0-9]{0,70}(Error|Exception)$' then p_name
    else 'Error'
  end;
$$;

-- Counts one error and returns the fingerprint it was counted under. A server error's kind is its route type (render,
-- route, action, middleware) and its route the route's file pattern; a browser error's kind is error,
-- unhandledrejection or boundary, and its route the page's pattern, kept as the latest seen but not part of the
-- fingerprint, so one bug on every listing page counts as one kind. The message is one of a fixed set
-- (laria_private.app_error_message), so a value in it can't split kinds either. The client is a browser family from
-- lib/monitoring/record-error.ts's list, and the digest the server's.
create or replace function public.record_app_error(
  p_source text,
  p_kind text,
  p_route text,
  p_name text,
  p_message text,
  p_client text default '',
  p_digest text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := date_bin(interval '10 minutes', clock_timestamp(), timestamptz '2001-01-01 00:00:00+00');
  v_kind text := case when p_kind ~ '^[a-z][a-z_-]{0,39}$' then p_kind else 'error' end;
  v_route text := laria_private.app_error_route(p_source, p_route);
  v_name text := laria_private.app_error_name(p_source, p_name);
  v_message text := laria_private.app_error_message(p_message);
  v_client text := case when p_source = 'browser'
    and (p_client ~ '^(Instagram|Facebook|TikTok|Samsung Internet|Edge|Opera|Firefox|Chrome|Safari)( iOS| Android)?$' or p_client = 'Otro')
    then p_client else '' end;
  v_digest text := case when p_source = 'server' and p_digest ~ '^[A-Za-z0-9_-]{1,40}$' then p_digest end;
  v_fingerprint text;
begin
  if p_source is null or p_source not in ('server', 'browser') then
    raise exception using errcode = '22023', message = 'APP_ERROR_INVALID';
  end if;
  v_fingerprint := md5(concat_ws(chr(31), p_source, v_kind, case when p_source = 'server' then v_route else '' end,
    v_name, v_message, v_client));
  if not exists (select 1 from laria_private.app_errors where fingerprint = v_fingerprint and bucket = v_bucket) then
    -- A new kind: one at a time per source and bucket, each counting the kinds the one before it added, so reports
    -- arriving together can't pass the cap.
    perform pg_advisory_xact_lock(hashtextextended(
      'laria-app-errors:' || p_source || ':' || extract(epoch from v_bucket)::bigint::text, 0));
    if not exists (select 1 from laria_private.app_errors where fingerprint = v_fingerprint and bucket = v_bucket)
      and (select count(*) from laria_private.app_errors where bucket = v_bucket and source = p_source) >= 25 then
      v_fingerprint := 'overflow-' || p_source;
      v_kind := 'overflow';
      v_route := '';
      v_name := 'Overflow';
      v_message := 'Otros errores: se guardan hasta 25 tipos distintos cada 10 minutos.';
      v_client := '';
      v_digest := null;
    end if;
  end if;
  insert into laria_private.app_errors as e (fingerprint, bucket, source, kind, route, name, message, client, digest,
                                             first_at, last_at)
  values (v_fingerprint, v_bucket, p_source, v_kind, v_route, v_name, v_message, v_client, v_digest,
          clock_timestamp(), clock_timestamp())
  on conflict (fingerprint, bucket) do update
    set occurrences = e.occurrences + 1,
        last_at = excluded.last_at,
        route = excluded.route,
        digest = coalesce(excluded.digest, e.digest);
  return v_fingerprint;
end;
$$;
revoke all on function public.record_app_error(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_app_error(text, text, text, text, text, text, text) to service_role;

-- ----------------------------------------------------------------------------------------------- 2. Admin

-- The kinds seen in the last p_days days (1 to 30), from the server, the browser or both, newest first, at most 200:
-- the latest name, message, route and digest of each, how many times, and when first and last.
create or replace function public.get_admin_app_errors(p_days integer default 7, p_source text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform laria_private.assert_admin();
  if p_days is null or p_days not between 1 and 30 or (p_source is not null and p_source not in ('server', 'browser')) then
    raise exception using errcode = '22023', message = 'APP_ERRORS_INVALID';
  end if;
  return coalesce((
    select jsonb_agg(grouped.item order by grouped.last_at desc, grouped.fingerprint)
    from (
      select e.fingerprint, max(e.last_at) as last_at, jsonb_build_object(
        'fingerprint', e.fingerprint,
        'source', min(e.source),
        'kind', min(e.kind),
        'route', (array_agg(e.route order by e.last_at desc))[1],
        'name', (array_agg(e.name order by e.last_at desc))[1],
        'message', (array_agg(e.message order by e.last_at desc))[1],
        'client', min(e.client),
        'digest', (array_agg(e.digest order by e.last_at desc) filter (where e.digest is not null))[1],
        'occurrences', sum(e.occurrences),
        'first_at', min(e.first_at),
        'last_at', max(e.last_at)
      ) as item
      from laria_private.app_errors e
      where e.bucket >= now() - make_interval(days => p_days)
        and (p_source is null or e.source = p_source)
      group by e.fingerprint
      order by max(e.last_at) desc, e.fingerprint
      limit 200
    ) grouped
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_app_errors(integer, text) from public, anon;
grant execute on function public.get_admin_app_errors(integer, text) to authenticated;

-- ----------------------------------------------------------------------------------------------- 3. health

-- Server errors in this 10-minute bucket and the one before, for /api/health. Answering at all shows the database is up.
create or replace function public.get_app_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('server_errors', coalesce(sum(e.occurrences), 0))
  from laria_private.app_errors e
  where e.source = 'server'
    and e.bucket >= date_bin(interval '10 minutes', now(), timestamptz '2001-01-01 00:00:00+00') - interval '10 minutes';
$$;
revoke all on function public.get_app_health() from public, anon, authenticated;
grant execute on function public.get_app_health() to service_role;

-- ----------------------------------------------------------------------------------------------- 4. retention

create or replace function laria_private.run_app_error_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from laria_private.app_errors where bucket < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function laria_private.app_error_route_patterns(), laria_private.app_error_route(text, text),
  laria_private.app_error_messages(), laria_private.app_error_own_messages(), laria_private.app_error_known_message(text),
  laria_private.app_error_message(text), laria_private.app_error_name(text, text), laria_private.run_app_error_retention()
from public, anon, authenticated;

-- Daily at 09:50 UTC (04:50 Lima). cron.schedule() with a job name replaces the job of that name.
select cron.schedule('app-error-retention', '50 9 * * *', $$select laria_private.run_app_error_retention()$$);

reset lock_timeout;
