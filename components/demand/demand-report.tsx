import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import {
  demandCount,
  demandPeriodLabel,
  demandRowLabel,
  demandRowPath,
  demandRowsFor,
  type DemandReport,
  type DemandSection,
} from "@/lib/demand-report";

// reach-06 "Lo que buscan en Laria" (docs/feature-ideas/store-reach.md). Counts, never advice: each table says what it
// counts, for which month and city, and that rows under the floor are left out. Rows are ordered by people only, and
// nothing on the page ranks, colors or flags a row as an opportunity.

const numbers = new Intl.NumberFormat("es-PE");

const SECTIONS: Record<DemandSection, { title: string; counts: string; empty: string }> = {
  brand: {
    title: "Marcas buscadas",
    counts: "Personas distintas que eligieron la marca en el filtro o la escribieron en el buscador",
    empty: "Ninguna marca llegó al mínimo de personas.",
  },
  query: {
    title: "Lo que escribieron en el buscador",
    counts: "Personas distintas que escribieron ese texto (en minúsculas y sin tildes), con los filtros de categoría, tipo o marca que lo acompañaron",
    empty: "Ningún texto llegó al mínimo de personas.",
  },
  type: {
    title: "Categorías y tipos de instrumento filtrados",
    counts: "Personas distintas que filtraron esa categoría o tipo de instrumento",
    empty: "Ninguna categoría ni tipo llegó al mínimo de personas.",
  },
  no_results: {
    title: "Búsquedas sin resultados",
    counts: "Personas distintas cuya búsqueda no encontró ninguna publicación en ese momento. Solo búsquedas sin filtros de precio, estado, vendedor ni características",
    empty: "Ninguna búsqueda sin resultados llegó al mínimo de personas.",
  },
  alert: {
    title: "Alertas guardadas",
    counts: "Cuentas de Particulares con una alerta activa de esa búsqueda al cierre del mes. No cuenta los filtros de precio, estado ni vendedor de la alerta",
    empty: "Ninguna alerta llegó al mínimo de cuentas.",
  },
};

export function DemandLimits({ report }: { report: DemandReport }) {
  const withCity = demandCount(report.searchersWithCity, report.threshold);
  const total = demandCount(report.searchers, report.threshold);
  const lima = demandCount(report.searchersInLima, report.threshold);
  return (
    <section aria-labelledby="limites-reporte" className="rounded-panel border border-line-strong bg-surface p-5 sm:p-6">
      <h2 id="limites-reporte" className="t-section text-ink">Qué no te dice este reporte</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 t-body text-ink">
        <li><strong>Una búsqueda no es una venta.</strong> Se busca por curiosidad, para comparar precios o para vender lo propio. Laria no sabe cuántas de estas personas compraron, ni dónde.</li>
        <li><strong>Son números pequeños.</strong> Con pocas personas, una diferencia de 5 o 10 puede ser casualidad y cambiar el mes siguiente. Por eso no mostramos nada con menos de {report.threshold} personas.</li>
        <li><strong>La mayoría de los datos es de Lima.</strong> De {total} personas, {withCity} eligieron una ciudad y {lima} eligieron Lima. Lo que ves por ciudad describe solo a quienes la eligieron.</li>
        <li><strong>Una persona puede contar más de una vez.</strong> Quien busca desde dos dispositivos sin iniciar sesión cuenta como dos. Una cuenta puede tener varias alertas parecidas, y una alerta puede seguir activa aunque la persona ya haya comprado.</li>
        <li><strong>No hay precios, márgenes ni costos.</strong> No sabemos cuánto pagarían estas personas ni si a tu tienda le conviene ofrecerlo.</li>
        <li><strong>Ningún modelo predice la demanda.</strong> Laria no calcula qué se va a vender ni recomienda qué stock tener. Las tablas van de más a menos personas y nada más.</li>
      </ul>
    </section>
  );
}

export function DemandMethod({ report }: { report: DemandReport }) {
  const built = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(new Date(report.builtAt));
  return (
    <details className="rounded-panel border border-subtle bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 t-ui font-semibold text-ink">Cómo se cuenta</summary>
      <ul className="list-disc space-y-2 border-t border-subtle py-4 pl-9 pr-4 t-meta text-ink-2">
        <li>Personas: cuentas con sesión iniciada y visitantes sin sesión (cada navegador cuenta como una persona). Cada persona cuenta una vez por fila, aunque haya buscado muchas veces.</li>
        <li>Búsquedas: la primera página de resultados de Instrumentos. Las búsquedas de cuentas de tienda y de Admin no se cuentan.</li>
        <li>Solo mostramos filas con {report.threshold} personas o más. Lo que buscaron menos personas no aparece, aunque se parezca a otra fila.</li>
        <li>Texto del buscador: lo guardamos en minúsculas y sin tildes. Si parecía un correo, un teléfono o un documento, no lo guardamos.</li>
        <li>Ciudad: la que la persona eligió en el filtro. Si eligió dos, cuenta en ambas. «Todo el Perú» incluye las búsquedas sin ciudad.</li>
        <li>Publicaciones activas: publicaciones aprobadas y con stock que encuentra la misma búsqueda en todo Laria, al {built}. No son las del mes.</li>
        <li>De tu tienda: las publicaciones activas de tu tienda que encuentra la misma búsqueda, en la misma fecha.</li>
      </ul>
    </details>
  );
}

export function DemandSectionTable({
  report,
  section,
  city,
  monthLabel,
}: {
  report: DemandReport;
  section: DemandSection;
  city: string | null;
  monthLabel: string;
}) {
  const config = SECTIONS[section];
  const rows = demandRowsFor(report.rows, section, city);
  const where = city ? `en ${city}` : "en todo el Perú";
  const unit = section === "alert" ? "Cuentas" : "Personas";
  const caption = `${config.counts}, ${section === "alert" ? `al cierre de ${monthLabel}` : demandPeriodLabel(report.month)}, ${where}. Solo filas con ${report.threshold} o más.`;
  const id = `demanda-${section}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="t-section text-ink">{config.title}</h2>
        <p className="mt-1 max-w-[80ch] t-meta text-ink-2">{caption}</p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-panel border border-subtle bg-surface">
          <table className="w-full min-w-[34rem] text-left t-ui">
            <caption className="sr-only">{config.title}. {caption}</caption>
            <thead className="t-meta text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Búsqueda</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{unit}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Publicaciones activas</th>
                {report.rows.some((row) => row.mine !== null) ? <th scope="col" className="px-4 py-3 text-right font-semibold">De tu tienda</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle tabular-nums text-ink">
              {rows.map((row) => (
                <tr key={`${row.section}-${row.position}`}>
                  <th scope="row" className="px-4 py-3 font-normal">
                    <Link href={demandRowPath(row)} className="inline-flex min-h-6 items-center underline decoration-accent decoration-2 underline-offset-[3px]">
                      {demandRowLabel(row)}
                    </Link>
                  </th>
                  <td className="px-4 py-3 text-right">{numbers.format(row.people)}</td>
                  <td className="px-4 py-3 text-right">{numbers.format(row.listed)}</td>
                  {row.mine !== null ? <td className="px-4 py-3 text-right">{numbers.format(row.mine)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-panel border border-subtle bg-surface px-4 py-3 t-ui text-ink-2">{config.empty}</p>
      )}
    </section>
  );
}

export function DemandEmpty() {
  return (
    <EmptyState
      title="Todavía no hay un reporte"
      description={(
        <>
          <p>El reporte se prepara a inicios de cada mes con el mes anterior completo. Si Laria no reunió al menos 5 personas en ninguna búsqueda, el reporte sale vacío.</p>
          <p className="mt-2">Mientras tanto, <Link href="/mi-cuenta/tienda/estadisticas">Estadísticas</Link> muestra las vistas y contactos de tus publicaciones.</p>
        </>
      )}
    />
  );
}
