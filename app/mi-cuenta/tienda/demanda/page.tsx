import { redirect } from "next/navigation";
import { DemandEmpty, DemandLimits, DemandMethod, DemandSectionTable } from "@/components/demand/demand-report";
import { ChipLink } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import {
  DEMAND_SECTIONS,
  demandCities,
  demandCount,
  demandMonthChipLabel,
  demandMonthLabel,
  demandPagePath,
  parseDemandMonth,
  parseDemandReport,
} from "@/lib/demand-report";
import { storeReachDb } from "@/lib/store-reach-db";

export const metadata = { title: "Lo que buscan en Laria" };

// reach-06 (docs/feature-ideas/store-reach.md): the monthly demand report for the owner of an active store.
export default async function StoreDemandPage({ searchParams }: { searchParams: Promise<{ mes?: string; ciudad?: string }> }) {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store) redirect("/mi-cuenta/tienda");
  const params = await searchParams;
  let result = null;
  if (supabase && store.status === "active") {
    const { data, error } = await storeReachDb(supabase).rpc("get_demand_report", { p_month: parseDemandMonth(params.mes) });
    result = error ? null : parseDemandReport(data);
  }
  const report = result?.report ?? null;
  const cities = report ? demandCities(report.rows) : [];
  const city = params.ciudad && cities.includes(params.ciudad) ? params.ciudad : null;
  const monthLabel = report ? demandMonthLabel(report.month) : "";

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Mi tienda"
          title="Lo que buscan en Laria"
          meta={(
            <p>
              Cuántas personas buscaron cada marca, modelo o tipo de instrumento en Laria durante un mes, y cuántas publicaciones
              activas lo ofrecen. Son conteos, no recomendaciones: no dicen qué comprar ni qué se va a vender.
            </p>
          )}
        />
        {result && result.months.length > 1 ? (
          <nav aria-label="Mes del reporte" className="mt-4 flex flex-wrap gap-2">
            {result.months.map((month) => (
              <ChipLink key={month} href={demandPagePath({ month })} selected={report?.month === month} current="page">
                {demandMonthChipLabel(month)}
              </ChipLink>
            ))}
          </nav>
        ) : null}
        {cities.length ? (
          <nav aria-label="Ciudad" className="mt-3 flex flex-wrap gap-2">
            <ChipLink href={demandPagePath({ month: report?.month })} selected={city === null} current="page">Todo el Perú</ChipLink>
            {cities.map((item) => (
              <ChipLink key={item} href={demandPagePath({ month: report?.month, city: item })} selected={city === item} current="page">
                {item}
              </ChipLink>
            ))}
          </nav>
        ) : null}
      </section>

      {store.status !== "active" ? (
        <Notice tone="info">El reporte está disponible cuando tu tienda está activa.</Notice>
      ) : !result ? (
        <Notice tone="warning">El reporte no está disponible en este momento. Intenta nuevamente más tarde.</Notice>
      ) : !report ? (
        <DemandEmpty />
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-panel border border-subtle bg-surface p-4">
              <dt className="t-meta text-ink-2">Personas que buscaron en {monthLabel}</dt>
              <dd className="mt-1 t-section tabular-nums text-ink">{demandCount(report.searchers, report.threshold)}</dd>
            </div>
            <div className="rounded-panel border border-subtle bg-surface p-4">
              <dt className="t-meta text-ink-2">De ellas, eligieron una ciudad</dt>
              <dd className="mt-1 t-section tabular-nums text-ink">{demandCount(report.searchersWithCity, report.threshold)}</dd>
            </div>
            <div className="rounded-panel border border-subtle bg-surface p-4">
              <dt className="t-meta text-ink-2">Cuentas con alertas activas al cierre del mes</dt>
              <dd className="mt-1 t-section tabular-nums text-ink">{demandCount(report.alertHolders, report.threshold)}</dd>
            </div>
          </dl>
          <DemandLimits report={report} />
          {DEMAND_SECTIONS.map((section) => (
            <DemandSectionTable key={section} report={report} section={section} city={city} monthLabel={monthLabel} />
          ))}
          <DemandMethod report={report} />
        </>
      )}
    </div>
  );
}
