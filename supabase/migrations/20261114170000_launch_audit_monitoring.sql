-- Launch audit A13: no error tracking, uptime checks or alerts.
--
-- Before: an error in a page, an API route, a server action or a visitor's browser left at most a line in Vercel's
-- runtime logs, and nobody would hear of an outage before the users did.
--
-- After:
-- 1. laria_private.app_errors counts each kind of error per 10 minutes, from the server (instrumentation.ts,
--    onRequestError) and from browsers (/api/client-errors), and keeps the counts 30 days (pg_cron
--    app-error-retention, daily at 09:50 UTC). public.record_app_error, for the service role only, keeps:
--    - the route as a pattern (laria_private.app_error_route): a browser page's address keeps only the fixed segments
--      of Laria's addresses, so a store's or a listing's slug reads […]; the server's route file pattern keeps
--      Next.js's own parts too ([id], (group), page, route);
--    - the error's name only when it is one of JavaScript's or the DOM's (on the server also a class of the app's own
--      ending in Error or Exception), otherwise Error;
--    - the message with web addresses cut to their scheme and host, query strings, e-mail addresses, ids, tokens,
--      paths past their first segment, quoted text, whatever follows the first ': ', and long numbers (with any kind
--      of space or dash) replaced (laria_private.scrub_error_text);
--    - the browser family from a fixed list, and the server's digest.
--    Never an account, an IP address or a stack. A message our own code writes may still hold a name in plain words,
--    so only an Admin with the second sign-in step reads the counts, and they are gone after 30 days. At most 25
--    kinds per source in each 10 minutes, admitted one at a time; the rest are counted in one overflow row, so a flood
--    of made-up reports can't fill the database.
-- 2. public.get_admin_app_errors(days, source) lists them for Admin (/admin/errores), grouped by kind, newest first.
-- 3. public.get_app_health() gives /api/health the server errors of the last 10 to 20 minutes. The uptime check
--    (.github/workflows/uptime.yml) fails, and GitHub e-mails the owner, when the site or the database doesn't answer
--    or those errors reach 20.
--
-- Compatibility: new objects only.
-- Locks: none beyond creating the table and the functions.
-- Rollback: select cron.unschedule('app-error-retention'); then drop the eight functions and laria_private.app_errors.

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

-- What may identify someone in an error message, replaced in this order: any kind of space or dash read as a plain one;
-- web addresses cut to their scheme and host (no user, password, path, query or fragment); query strings and fragments
-- with values; e-mail addresses; ids; tokens (JSON web tokens, 16 or more letters, digits, _ or - with a digit, and any
-- 32 or more); paths past their first segment (/tiendas/ana-perez reads /tiendas/…); quoted text; whatever follows the
-- first ': ', which in an error message is usually the value it was given; runs of 7 or more digits, spaces and
-- separators (phone, DNI, RUC and card numbers, dates and IP addresses). A name written in plain words elsewhere stays.
create or replace function laria_private.scrub_error_text(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  scrubbed text := coalesce(p_text, '');
begin
  scrubbed := regexp_replace(scrubbed, '[\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]', ' ', 'g');
  scrubbed := regexp_replace(scrubbed, '[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]', '-', 'g');
  scrubbed := regexp_replace(scrubbed, '([A-Za-z][A-Za-z0-9+.-]*://)[^/?#\s]*@', '\1', 'g');
  scrubbed := regexp_replace(scrubbed, '([A-Za-z][A-Za-z0-9+.-]*://[^/?#\s"''`<>()]*)[/?#][^\s"''`<>()]*', '\1/…', 'g');
  scrubbed := regexp_replace(scrubbed, '([?#])[A-Za-z0-9_.%-]+=[^\s"''`<>]*', '\1…', 'g');
  scrubbed := regexp_replace(scrubbed, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g');
  scrubbed := regexp_replace(scrubbed, '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}', '<id>', 'g');
  scrubbed := regexp_replace(scrubbed, 'eyJ[A-Za-z0-9_-]{6,}(\.[A-Za-z0-9_-]*){0,2}', '<token>', 'g');
  scrubbed := regexp_replace(scrubbed, '(?=[A-Za-z_-]*[0-9])[A-Za-z0-9_-]{16,}', '<token>', 'g');
  scrubbed := regexp_replace(scrubbed, '[A-Za-z0-9_-]{32,}', '<token>', 'g');
  scrubbed := regexp_replace(scrubbed, '(^|[\s(=''"`])(/[A-Za-z0-9_.~%-]+)/[^\s"''`<>)]*', '\1\2/…', 'g');
  scrubbed := regexp_replace(scrubbed, '"[^"]*"', '"…"', 'g');
  scrubbed := regexp_replace(scrubbed, '`[^`]*`', '`…`', 'g');
  scrubbed := regexp_replace(scrubbed, '“[^”]*”', '“…”', 'g');
  scrubbed := regexp_replace(scrubbed, '‘[^’]*’', '‘…’', 'g');
  scrubbed := regexp_replace(scrubbed, '«[^»]*»', '«…»', 'g');
  -- Single quotes only around a word, so an apostrophe (can't) stays.
  scrubbed := regexp_replace(scrubbed, '(^|[^A-Za-z0-9\u00c0-\u024f])''[^'']*''(?![A-Za-z0-9\u00c0-\u024f])', '\1''…''', 'g');
  scrubbed := regexp_replace(scrubbed, ': .*$', ': …');
  scrubbed := regexp_replace(scrubbed, '\+?[0-9][0-9 ().:/-]{5,}[0-9]', '<n>', 'g');
  return scrubbed;
end;
$$;

-- The fixed segments of Laria's addresses: the folders under app/ on main and on features/marketplace, and the
-- metadata files at its root. A new folder goes here too (tests/launch-audit-monitoring.test.cjs checks every one is
-- listed); until then its errors read […] for it.
create or replace function laria_private.app_error_route_segments()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'account', 'account-navigation', 'admin', 'ajustes', 'alertas', 'alerts', 'amplificadores', 'andinos', 'api',
    'apple-icon.png', 'articulos-prohibidos', 'artistas', 'audio', 'auditoria', 'auth', 'ayuda', 'baja', 'bajos',
    'bundle-offer', 'callback', 'campaigns', 'campanas', 'cartel', 'catalog', 'catalogo-redes', 'check-email',
    'cleanup', 'client-errors', 'colecciones', 'comparar', 'compartida', 'compartir', 'complete', 'compra-en-tienda',
    'comprador', 'comprobantes', 'confianza', 'confirmacion-correo', 'connect', 'consejos-de-seguridad',
    'consignacion', 'contact', 'correos', 'csp-report', 'cuerdas', 'data', 'datos', 'deal-trust', 'dealers', 'delete',
    'demand-report', 'demanda', 'device', 'disconnect', 'discovery', 'distribuidor', 'distribuidores', 'document',
    'editar', 'email', 'equipo', 'equipos-reportados', 'errores', 'estadisticas', 'etiquetas', 'events', 'everywhere',
    'export', 'fabricantes', 'facets', 'favorites', 'favoritos', 'feeds', 'fields', 'follows', 'fonts',
    'fotos-repetidas', 'garantia', 'gear-reminders', 'gone', 'guias', 'guitarras', 'health', 'hecho-en-peru', 'help',
    'help-tickets', 'herramientas', 'historia', 'horario', 'icon.svg', 'import', 'importar', 'imports',
    'installments', 'instrumentos', 'internal', 'inventario', 'inventory', 'invitacion', 'invite-user', 'items',
    'jobs', 'laria', 'libro-de-reclamaciones', 'listados', 'listing', 'listing-details', 'listing-flags',
    'listing-images', 'listing-questions', 'listing-reviews', 'listing-viewer', 'listings', 'login', 'logout',
    'manage', 'manifest.webmanifest', 'map', 'medios-de-pago', 'mercado-libre', 'mi-cuenta', 'microfonos',
    'mis-consultas', 'mis-reportes', 'mostrador', 'notificaciones', 'nueva', 'nuevo', 'ofertas', 'opengraph-image',
    'page', 'pagos', 'parte-de-pago', 'payment-methods', 'pedales', 'percusion', 'perfil', 'photo-cleanup',
    'photo-fingerprints', 'photo-uploads', 'photos', 'precios', 'preferences', 'price-steps', 'privacidad', 'probe',
    'process', 'pruebas', 'public-pages', 'publicaciones', 'publicar', 'publicar-seleccionados', 'publication',
    'publish-selection', 'push', 'receipts', 'recibir', 'recovery', 'recuperar-contrasena', 'red-flags', 'refresh',
    'regalos', 'registrar-tienda', 'registro', 'reorder', 'reponer', 'report', 'reportar-robo', 'reports',
    'resend-confirmation', 'restablecer-contrasena', 'review-photos', 'robots.txt', 'rows', 'sedes', 'seguridad',
    'services', 'servicios', 'session', 'sessions', 'share', 'sitemap.xml', 'solicitudes', 'status', 'step',
    'stolen-gear', 'store', 'store-floor', 'store-imports', 'submissions', 'suggest', 'sweep', 'taller', 'teclados',
    'template', 'terminos', 'tickets', 'tienda', 'tiendas', 'trade-offers', 'trade-photos', 'transacciones',
    'two-step', 'unsubscribe', 'uploads', 'valores-por-defecto', 'vendedor', 'vendedores', 'vender', 'vientos',
    'view', 'vista-previa'
  ]::text[];
$$;

-- An error's route as a pattern, at most 200 characters, without a query string or fragment. A browser page's address
-- keeps the segments of laria_private.app_error_route_segments() and turns any other into […], so a store's or a
-- listing's slug never stays. The server's route file pattern (Next.js's routePath, such as /listados/[id]/page) also
-- keeps Next.js's own parts: [param], (group), @slot, app, page, route and its metadata files.
create or replace function laria_private.app_error_route(p_source text, p_route text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(left(string_agg(
    case
      when part.segment = '' or part.segment = any (laria_private.app_error_route_segments()) then part.segment
      when p_source = 'server' and (part.segment ~ '^\[{1,2}(\.\.\.)?[A-Za-z0-9_-]{1,40}\]{1,2}$'
        or part.segment ~ '^(\([A-Za-z0-9_.-]{1,40}\)|@[A-Za-z0-9_-]{1,40})$'
        or part.segment in ('app', 'page', 'route', 'default', 'middleware', '_not-found', '_global-error', '_error')
        or part.segment ~ '^(opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest|favicon)[A-Za-z0-9_.-]{0,40}$')
        then part.segment
      else '[…]'
    end, '/' order by part.position), 200), '')
  from unnest(string_to_array(split_part(split_part(left(coalesce(p_route, ''), 1000), '?', 1), '#', 1), '/'))
    with ordinality as part(segment, position)
  where coalesce(p_route, '') <> '';
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
-- unhandledrejection or boundary, and its route the page's address as a pattern, kept as the latest seen but not part
-- of the fingerprint, so one bug on every listing page counts as one kind. Numbers in the message don't split kinds
-- either. The client is a browser family from lib/monitoring/record-error.ts's list, and the digest the server's.
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
  v_message text := left(laria_private.scrub_error_text(left(p_message, 2000)), 300);
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
    v_name, regexp_replace(v_message, '[0-9]+', '0', 'g'), v_client));
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
revoke all on function laria_private.scrub_error_text(text), laria_private.app_error_route_segments(),
  laria_private.app_error_route(text, text), laria_private.app_error_name(text, text),
  laria_private.run_app_error_retention()
from public, anon, authenticated;

-- Daily at 09:50 UTC (04:50 Lima). cron.schedule() with a job name replaces the job of that name.
select cron.schedule('app-error-retention', '50 9 * * *', $$select laria_private.run_app_error_retention()$$);

reset lock_timeout;
