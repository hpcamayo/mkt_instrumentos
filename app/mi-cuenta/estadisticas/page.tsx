import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountAnalyticsMetrics } from "@/components/account-analytics";
import { ListingTipsList } from "@/components/statistics/listing-tips-list";
import { buttonClasses } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountAnalytics, getListingStatistics, parseStatisticsWindow } from "@/lib/account-analytics";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Estadísticas" };

const numbers = new Intl.NumberFormat("es-PE");

// Particular statistics (mine-11): period numbers per listing with plain next steps, then the lifetime totals.
export default async function ParticularStatisticsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { profile } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/estadisticas");
  if (profile?.account_type !== "seller") redirect("/mi-cuenta");
  // Default period: 30 days.
  const days = parseStatisticsWindow((await searchParams).periodo);
  const [statistics, lifetime] = await Promise.all([getListingStatistics(days), getAccountAnalytics(0)]);
  const totals = statistics?.listings.reduce(
    (sum, listing) => ({ views: sum.views + listing.views, contacts: sum.contacts + listing.contacts, saves: sum.saves + listing.saves }),
    { views: 0, contacts: 0, saves: 0 },
  );

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Cuenta Particular"
          title="Estadísticas"
          meta="Cómo les va a tus publicaciones y qué puedes mejorar en cada una."
        />
        <nav aria-label="Periodo de estadísticas" className="mt-4 flex flex-wrap gap-2">
          {([7, 30, 90] as const).map((period) => <ChipLink key={period} href={`/mi-cuenta/estadisticas?periodo=${period}`} selected={days === period} current="page">{`${period} días`}</ChipLink>)}
        </nav>
      </section>

      {!statistics || !totals ? (
        <Notice tone="warning">Las estadísticas del periodo no están disponibles en este momento. Intenta nuevamente más tarde.</Notice>
      ) : statistics.listings.length === 0 ? (
        <EmptyState
          title="Aún no tienes publicaciones con estadísticas"
          description="Cuando publiques un instrumento verás aquí sus vistas, contactos por WhatsApp y guardados."
          actions={<Link href="/mi-cuenta/publicar" className={buttonClasses()}>Publicar instrumento</Link>}
        />
      ) : (
        <>
          <section aria-labelledby="resumen-periodo" className="space-y-3">
            <h2 id="resumen-periodo" className="t-section text-ink">{`Últimos ${days} días`}</h2>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Figure label="Vistas" value={totals.views} />
              <Figure label="Contactos por WhatsApp" value={totals.contacts} />
              <Figure label="Guardados" value={totals.saves} />
            </dl>
            <p className="t-meta text-ink-2">Los contactos cuentan aperturas de WhatsApp, no mensajes ni ventas. Los guardados son veces que alguien guardó una publicación en favoritos.</p>
          </section>
          <section aria-labelledby="por-publicacion" className="space-y-3">
            <div>
              <h2 id="por-publicacion" className="t-section text-ink">Por publicación</h2>
              <p className="mt-1 t-meta text-ink-2">Las publicadas primero. Cada sugerencia abre la edición de la publicación.</p>
            </div>
            <ListingTipsList listings={statistics.listings} days={days} />
          </section>
        </>
      )}

      <section aria-labelledby="todo-el-historial" className="space-y-3">
        <h2 id="todo-el-historial" className="t-section text-ink">Todo el historial</h2>
        <AccountAnalyticsMetrics analytics={lifetime} />
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-panel border border-subtle bg-white p-4">
      <dt className="t-ui font-semibold text-ink-2">{label}</dt>
      <dd className="mt-2 text-[28px] font-bold leading-[32px] stretch-semicond text-ink">{numbers.format(value)}</dd>
    </div>
  );
}
