import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { requireAdmin } from "@/lib/admin-server";
import { APP_ERROR_PERIODS, APP_ERROR_SOURCES, appErrorKindLabel, parseAppErrors } from "@/lib/monitoring/admin-errors";

export const metadata = { title: "Errores" };

// Times read in Lima time, whatever the server's timezone (UX-7 W4).
const ERROR_DATE_FORMATTER = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });

function filterHref(origin: string, days: number) {
  const params = new URLSearchParams();
  if (origin) params.set("origen", origin);
  if (days !== 7) params.set("dias", String(days));
  const query = params.toString();
  return query ? `/admin/errores?${query}` : "/admin/errores";
}

// Launch audit A13: the errors the server and the visitors' browsers counted (supabase/migrations/
// 20261114170000_launch_audit_monitoring.sql), grouped by kind, newest first. The uptime check that e-mails the owner
// when the site fails is .github/workflows/uptime.yml.
export default async function AdminErrorsPage({ searchParams }: { searchParams: Promise<{ origen?: string; dias?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/errores"), searchParams]);
  const origin = APP_ERROR_SOURCES.find((option) => option.param === query.origen) ?? APP_ERROR_SOURCES[0];
  const days = APP_ERROR_PERIODS.find((value) => String(value) === query.dias) ?? 7;
  const { data, error } = await supabase.rpc("get_admin_app_errors", { p_days: days, ...(origin.source ? { p_source: origin.source } : {}) });
  const rows = parseAppErrors(data);
  const total = rows.reduce((sum, row) => sum + row.occurrences, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Errores"
        meta={<p className="max-w-[68ch]">Los errores del servidor y de los navegadores de los visitantes, agrupados por tipo. Se guardan 30 días, sin cuentas ni direcciones IP: las páginas se ven como patrones, y los correos, números, enlaces y textos entre comillas se quitan antes de guardarlos. Además, una revisión externa abre el sitio cada 10 minutos y GitHub te avisa por correo cuando falla.</p>}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <nav aria-label="Origen del error" className="flex flex-wrap gap-2">
          {APP_ERROR_SOURCES.map((option) => (
            <ChipLink key={option.param || "todos"} href={filterHref(option.param, days)} selected={option.param === origin.param} current="page">
              {option.label}
            </ChipLink>
          ))}
        </nav>
        <nav aria-label="Periodo" className="flex flex-wrap gap-2">
          {APP_ERROR_PERIODS.map((value) => (
            <ChipLink key={value} href={filterHref(origin.param, value)} selected={value === days} current="page">
              {value === 1 ? "24 horas" : `${value} días`}
            </ChipLink>
          ))}
        </nav>
      </div>
      {error ? (
        <Notice tone="danger">No pudimos cargar los errores. No asumiremos que no hay ninguno.</Notice>
      ) : rows.length ? (
        <>
          <p className="t-meta text-ink-2">{rows.length === 1 ? "1 tipo de error" : `${rows.length} tipos de error`}, {total === 1 ? "1 vez" : `${total} veces`} en total.</p>
          <ul className="grid gap-3">
            {rows.map((row) => (
              <li key={row.fingerprint} className="rounded-panel border border-subtle bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Tag tone={row.source === "server" ? "warning" : "neutral"}>{row.source === "server" ? "Servidor" : "Navegador"}</Tag>
                    <Tag tone="line">{appErrorKindLabel(row.kind)}</Tag>
                    {row.client ? <Tag tone="line">{row.client}</Tag> : null}
                  </div>
                  <strong className="t-ui text-ink">{row.occurrences === 1 ? "1 vez" : `${row.occurrences} veces`}</strong>
                </div>
                <p className="mt-2 break-words font-mono text-[13px] text-ink">{row.name}{row.message ? `: ${row.message}` : ""}</p>
                <dl className="mt-3 grid gap-1 text-meta text-ink-2 sm:grid-cols-2">
                  {row.route ? <div><dt className="inline font-semibold">Ruta: </dt><dd className="inline break-all font-mono text-[13px]">{row.route}</dd></div> : null}
                  {row.digest ? <div><dt className="inline font-semibold">Código en los registros de Vercel: </dt><dd className="inline font-mono text-[13px]">{row.digest}</dd></div> : null}
                  <div><dt className="inline font-semibold">Primera vez: </dt><dd className="inline"><time dateTime={row.first_at}>{ERROR_DATE_FORMATTER.format(new Date(row.first_at))}</time></dd></div>
                  <div><dt className="inline font-semibold">Última vez: </dt><dd className="inline"><time dateTime={row.last_at}>{ERROR_DATE_FORMATTER.format(new Date(row.last_at))}</time></dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState headingLevel={2} title="No hay errores en este periodo" description="Cuando el servidor o un navegador encuentre un error, aparecerá aquí." />
      )}
    </div>
  );
}
