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
--    - a browser's message only as one of a fixed list of messages of browsers, JavaScript, React, Next.js and
--      Supabase, with any value in it read as … (laria_private.app_error_browser_message), and any other message as
--      "Otro mensaje (no se guarda el texto)": what a visitor's browser sends is never kept as written;
--    - the server's message with web addresses cut to their scheme and the host of a service Laria uses, query
--      strings, e-mail addresses, ids, tokens and credentials, IPv6 addresses, paths past their first segment, quoted
--      text, whatever follows the first ': ', and long numbers (with any kind of space, dash or line break) replaced
--      (laria_private.scrub_error_text);
--    - the browser family from a fixed list, and the server's digest.
--    Never an account, an IP address or a stack. A message the server's own code writes may still hold a name in plain
--    words, so only an Admin with the second sign-in step reads the counts, and they are gone after 30 days. At most
--    25 kinds per source in each 10 minutes, admitted one at a time; the rest are counted in one overflow row, so a
--    flood of made-up reports can't fill the database.
-- 2. public.get_admin_app_errors(days, source) lists them for Admin (/admin/errores), grouped by kind, newest first.
-- 3. public.get_app_health() gives /api/health the server errors of the last 10 to 20 minutes. The uptime check
--    (.github/workflows/uptime.yml) fails, and GitHub e-mails the owner, when the site or the database doesn't answer
--    or those errors reach 20.
--
-- Compatibility: new objects only.
-- Locks: none beyond creating the table and the functions.
-- Rollback: select cron.unschedule('app-error-retention'); then drop the ten functions and laria_private.app_errors.

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

-- What may identify someone in a message the server's own code wrote, replaced in this order: compatibility forms read
-- as plain ones (fullwidth digits and letters), every kind of space, tab and line break as one space and every kind of
-- dash as a plain one; web addresses cut to their scheme and host (no user, password, path, query or fragment), and a
-- host that isn't one of the services Laria uses read <host>; query strings and fragments with values; e-mail
-- addresses, also percent-encoded or in any script (any word with @ or %40 inside); ids; tokens (JSON web tokens, 16
-- or more letters, digits, _ or - with a digit, and any 32 or more), whatever follows Bearer or Basic, and any value
-- given to a name (password=…); IPv6 addresses; paths past their first segment (/tiendas/ana-perez reads
-- /tiendas/…); quoted text; whatever follows the first ': ', which in an error message is usually the value it was
-- given; runs of 7 or more digits, spaces and separators (phone, DNI, RUC and card numbers, dates and IPv4 addresses).
-- A name written in plain words elsewhere stays. A browser's message never comes here: only a fixed list of messages
-- is kept from browsers (laria_private.app_error_browser_message).
create or replace function laria_private.scrub_error_text(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  scrubbed text := normalize(left(coalesce(p_text, ''), 2000), NFKC);
begin
  scrubbed := regexp_replace(scrubbed, '[\s\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g');
  scrubbed := regexp_replace(scrubbed, '[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]', '-', 'g');
  scrubbed := regexp_replace(scrubbed, '([A-Za-z][A-Za-z0-9+.-]*://)[^/?#\s]*@', '\1', 'g');
  scrubbed := regexp_replace(scrubbed, '([A-Za-z][A-Za-z0-9+.-]*://[^/?#\s"''`<>()]*)[/?#][^\s"''`<>()]*', '\1/…', 'g');
  scrubbed := regexp_replace(scrubbed, '([A-Za-z][A-Za-z0-9+.-]*://)(?!(localhost|127\.0\.0\.1|([A-Za-z0-9-]+\.)*('
    || 'laria\.audio|laria\.pro|vercel\.app|vercel\.com|supabase\.co|supabase\.com|supabase\.in|resend\.com|'
    || 'wa\.me|whatsapp\.com|mercadolibre\.com|mercadolibre\.com\.pe|googleapis\.com|gstatic\.com|nextjs\.org|'
    || 'react\.dev))(:[0-9]{1,5})?([/\s"''`<>()]|$))[^/?#\s"''`<>()]+', '\1<host>', 'g');
  scrubbed := regexp_replace(scrubbed, '([?#])[A-Za-z0-9_.%-]+=[^\s"''`<>]*', '\1…', 'g');
  scrubbed := regexp_replace(scrubbed, '[^\s"''`<>()\[\]{},;]+(@|%40)[^\s"''`<>()\[\]{},;]+', '<email>', 'g');
  scrubbed := regexp_replace(scrubbed, '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}', '<id>', 'g');
  scrubbed := regexp_replace(scrubbed, 'eyJ[A-Za-z0-9_-]{6,}(\.[A-Za-z0-9_-]*){0,2}', '<token>', 'g');
  scrubbed := regexp_replace(scrubbed, '(?=[A-Za-z_-]*[0-9])[A-Za-z0-9_-]{16,}', '<token>', 'g');
  scrubbed := regexp_replace(scrubbed, '[A-Za-z0-9_-]{32,}', '<token>', 'g');
  scrubbed := regexp_replace(scrubbed, '\m(Bearer|Basic)\s+[^\s"''`<>(),;]+', '\1 …', 'gi');
  scrubbed := regexp_replace(scrubbed, '([A-Za-z_][A-Za-z0-9_.-]{0,40})=[^\s&;,)]+', '\1=…', 'g');
  scrubbed := regexp_replace(scrubbed, '(^|[^A-Za-z0-9:])[0-9A-Fa-f]{0,4}(:[0-9A-Fa-f]{0,4}){2,7}(?![A-Za-z0-9:])', '\1<ip>', 'g');
  scrubbed := regexp_replace(scrubbed, '(^|[\s(=''"`])(/[A-Za-z0-9_.~%-]+)/[^\s"''`<>)]*', '\1\2/…', 'g');
  scrubbed := regexp_replace(scrubbed, '"[^"]*"', '"…"', 'g');
  scrubbed := regexp_replace(scrubbed, '`[^`]*`', '`…`', 'g');
  scrubbed := regexp_replace(scrubbed, '“[^”]*”', '“…”', 'g');
  scrubbed := regexp_replace(scrubbed, '‘[^’]*’', '‘…’', 'g');
  scrubbed := regexp_replace(scrubbed, '«[^»]*»', '«…»', 'g');
  scrubbed := regexp_replace(scrubbed, '「[^」]*」', '「…」', 'g');
  -- Single quotes only around a word, so an apostrophe (can't) stays.
  scrubbed := regexp_replace(scrubbed, '(^|[^A-Za-z0-9\u00c0-\u024f])''[^'']*''(?![A-Za-z0-9\u00c0-\u024f])', '\1''…''', 'g');
  scrubbed := regexp_replace(scrubbed, ': .*$', ': …');
  scrubbed := regexp_replace(scrubbed, '\+?[0-9][0-9 ().:/-]{5,}[0-9]', '<n>', 'g');
  return scrubbed;
end;
$$;

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

-- What a browser's message is kept as: one of these messages of browsers, JavaScript engines, React, Next.js and
-- Supabase, with whatever names a value in them (a property, a variable, an address) read as …. They are tried in
-- order on the message as one line, without "Uncaught " or an error name in front, and the first whose pattern
-- matches replaces the whole line with its message; \1 and \2 bring back only a word from the pattern's own list.
-- A message none matches reads "Otro mensaje (no se guarda el texto)", so nothing a visitor, a browser extension or a
-- made-up report writes is kept as written. Each message reads back as itself (tests/launch-audit-monitoring.sql).
create or replace function laria_private.app_error_browser_messages()
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
    (11, '^Minified React error #([0-9]{1,4})',
      'Minified React error #\1'),
    (12, '^Hydration failed',
      'Hydration failed because the server rendered HTML didn''t match the client.'),
    (13, '^There was an error while hydrating',
      'There was an error while hydrating.'),
    (14, '^Text content does not match server-rendered HTML',
      'Text content does not match server-rendered HTML.'),
    (15, '^This Suspense boundary received an update before it finished hydrating',
      'This Suspense boundary received an update before it finished hydrating.'),
    (16, '^Switched to client rendering because the server rendering errored',
      'Switched to client rendering because the server rendering errored.'),
    (17, '^The server could not finish this Suspense boundary',
      'The server could not finish this Suspense boundary.'),
    (18, '^An error occurred in the Server Components render',
      'An error occurred in the Server Components render.'),
    (19, '^Rendered more hooks than',
      'Rendered more hooks than during the previous render.'),
    (20, '^Rendered fewer hooks than',
      'Rendered fewer hooks than expected.'),
    (21, '^Objects are not valid as a React child',
      'Objects are not valid as a React child.'),
    (22, '^Too many re-renders',
      'Too many re-renders.'),
    (23, '^Maximum update depth exceeded',
      'Maximum update depth exceeded.'),
    (24, '^Should not already be working',
      'Should not already be working.'),
    (25, '^Connection closed',
      'Connection closed.'),
    (26, '^Invariant: ',
      'Invariant: …'),
    (27, '^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)',
      '\1'),
    (28, '^Failed to execute ''removeChild'' on ''Node''',
      'Failed to execute ''removeChild'' on ''Node'': The node to be removed is not a child of this node.'),
    (29, '^Failed to execute ''insertBefore'' on ''Node''',
      'Failed to execute ''insertBefore'' on ''Node'': The node before which the new node is to be inserted is not a child of this node.'),
    (30, '^The object can not be found here',
      'The object can not be found here.'),
    (31, '^Failed to read the ''(localStorage|sessionStorage|indexedDB|cookie)'' property from ''(Window|Document)''',
      'Failed to read the ''\1'' property from ''\2'': …'),
    (32, '^Failed to execute ''[^'']{1,60}'' on ''[^'']{1,60}''',
      'Failed to execute ''…'' on ''…'': …'),
    (33, '^Failed to construct ''[^'']{1,60}''',
      'Failed to construct ''…'': …'),
    (34, '^Failed to read the ''[^'']{1,60}'' property',
      'Failed to read the ''…'' property from ''…'': …'),
    (35, '^Failed to set the ''[^'']{1,60}'' property',
      'Failed to set the ''…'' property on ''…'': …'),
    (36, '^Failed to register a ServiceWorker',
      'Failed to register a ServiceWorker: …'),
    (37, '^Registration failed',
      'Registration failed: …'),
    (38, '^(The quota has been exceeded|.*exceeded the quota)',
      'The quota has been exceeded.'),
    (39, '^The operation is insecure',
      'The operation is insecure.'),
    (40, '^Access is denied for this document',
      'Access is denied for this document.'),
    (41, '^The request is not allowed by the user agent or the platform in the current context',
      'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.'),
    (42, '^Permission denied',
      'Permission denied.'),
    (43, '^The play\(\) request was interrupted',
      'The play() request was interrupted.'),
    (44, '^play\(\) failed because the user didn''t interact with the document first',
      'play() failed because the user didn''t interact with the document first.'),
    (45, '^The element has no supported sources',
      'The element has no supported sources.'),
    (46, '^(Share canceled|Abort due to cancellation of share)',
      '\1'),
    (47, '^Acquiring an exclusive Navigator LockManager lock',
      'Acquiring an exclusive Navigator LockManager lock … failed.'),
    (48, '^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource|cancelled)',
      '\1'),
    (49, '^(The network connection was lost|The Internet connection appears to be offline)',
      '\1'),
    (50, '^(The operation was aborted|The user aborted a request|signal is aborted without reason)',
      '\1'),
    (51, '^(Request|The request) timed out',
      'Request timed out.'),
    (52, '^Invalid Refresh Token',
      'Invalid Refresh Token: …'),
    (53, '^Auth session missing',
      'Auth session missing!'),
    (54, '^JWT expired',
      'JWT expired'),
    (55, '^Can''t find variable: ',
      'Can''t find variable: …'),
    (56, '^(undefined|null) is not an object',
      '\1 is not an object (evaluating ''…'')'),
    (57, '^Cannot read properties of (undefined|null)',
      'Cannot read properties of \1 (reading ''…'')'),
    (58, '^Cannot read property .* of (undefined|null)',
      'Cannot read properties of \1 (reading ''…'')'),
    (59, '^Cannot set properties of (undefined|null)',
      'Cannot set properties of \1 (setting ''…'')'),
    (60, '^Cannot set property .* of (undefined|null)',
      'Cannot set properties of \1 (setting ''…'')'),
    (61, '^can''t access property .*, .* is (undefined|null)',
      'can''t access property …, … is \1'),
    (62, '^Cannot destructure property .* as it is (undefined|null)',
      'Cannot destructure property ''…'' of ''…'' as it is \1.'),
    (63, '^Cannot destructure ',
      'Cannot destructure …'),
    (64, '^Right side of assignment cannot be destructured',
      'Right side of assignment cannot be destructured'),
    (65, '^Cannot access .* before initialization',
      'Cannot access ''…'' before initialization.'),
    (66, '^can''t access lexical declaration',
      'can''t access lexical declaration ''…'' before initialization'),
    (67, '^Assignment to constant variable',
      'Assignment to constant variable.'),
    (68, '^Cannot convert undefined or null to object',
      'Cannot convert undefined or null to object.'),
    (69, '^Cannot use ''in'' operator',
      'Cannot use ''in'' operator to search for ''…'' in …'),
    (70, '^Cannot assign to read only property',
      'Cannot assign to read only property ''…'' of …'),
    (71, '^Cannot add property .*, object is not extensible',
      'Cannot add property …, object is not extensible'),
    (72, '^Cannot redefine property',
      'Cannot redefine property: …'),
    (73, '^Converting circular structure to JSON',
      'Converting circular structure to JSON.'),
    (74, '^(Maximum call stack size exceeded|too much recursion|Out of memory|Illegal invocation)',
      '\1'),
    (75, '^(Invalid time value|Invalid Date|Invalid array length)',
      '\1'),
    (76, '^(Unexpected end of JSON input|Invalid or unexpected token)',
      '\1'),
    (77, '^JSON\.parse: ',
      'JSON.parse: …'),
    (78, '^JSON Parse error: ',
      'JSON Parse error: …'),
    (79, '^.* is not valid JSON',
      '… is not valid JSON'),
    (80, '^Unexpected token',
      'Unexpected token …'),
    (81, '^Unexpected (identifier|end of input|end of script|string|number|keyword|EOF)',
      'Unexpected \1'),
    (82, '^missing \) after argument list',
      'missing ) after argument list'),
    (83, '^Invalid regular expression',
      'Invalid regular expression: …'),
    (84, '^The string did not match the expected pattern',
      'The string did not match the expected pattern.'),
    (85, '^.* is not a function',
      '… is not a function'),
    (86, '^.* is not a constructor',
      '… is not a constructor'),
    (87, '^.* is not iterable',
      '… is not iterable'),
    (88, '^.* is not defined',
      '… is not defined'),
    (89, '^.* is read-only',
      '… is read-only'),
    (90, '^.* has no properties',
      '… has no properties'),
    (91, '^.* is (undefined|null)$',
      '… is \1'),
    (92, '^(undefined|null|false|\[object (Object|Event|ProgressEvent|ErrorEvent|Response|DOMException|Error)\])$',
      '\1'),
    (93, '^Java exception was raised during method invocation',
      'Java exception was raised during method invocation'),
    (94, '^Object Not Found Matching Id:',
      'Object Not Found Matching Id: …, MethodName: …, ParamCount: …'),
    (95, '^(Script error|ResizeObserver loop)',
      '\1 …'),
    (96, '^(\(sin mensaje\))?$',
      '(sin mensaje)');
$$;

create or replace function laria_private.app_error_browser_message(p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select regexp_replace(given.line, template.pattern || '.*$', template.message)
    from laria_private.app_error_browser_messages() template,
      (select regexp_replace(regexp_replace(trim(regexp_replace(normalize(left(coalesce(p_message, ''), 2000), NFKC),
        '[\s\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g')),
        '^Uncaught (\(in promise\) )?', ''), '^[A-Za-z]{0,40}(Error|Exception): ', '') as line) given
    where given.line ~ template.pattern
    order by template.ordinal
    limit 1
  ), 'Otro mensaje (no se guarda el texto)');
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
-- fingerprint, so one bug on every listing page counts as one kind. Numbers in a server's message don't split kinds
-- either; a browser's message is one of a fixed list. The client is a browser family from
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
  v_message text := case when p_source = 'browser' then laria_private.app_error_browser_message(p_message)
    else left(laria_private.scrub_error_text(p_message), 300) end;
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
    v_name, case when p_source = 'server' then regexp_replace(v_message, '[0-9]+', '0', 'g') else v_message end,
    v_client));
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
revoke all on function laria_private.scrub_error_text(text), laria_private.app_error_route_patterns(),
  laria_private.app_error_route(text, text), laria_private.app_error_browser_messages(),
  laria_private.app_error_browser_message(text), laria_private.app_error_name(text, text),
  laria_private.run_app_error_retention()
from public, anon, authenticated;

-- Daily at 09:50 UTC (04:50 Lima). cron.schedule() with a job name replaces the job of that name.
select cron.schedule('app-error-retention', '50 9 * * *', $$select laria_private.run_app_error_retention()$$);

reset lock_timeout;
