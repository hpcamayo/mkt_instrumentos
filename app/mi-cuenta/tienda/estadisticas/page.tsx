import { ChipLink } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { redirect } from "next/navigation";
import { AccountAnalyticsMetrics } from "@/components/account-analytics";
import { ContactsWithoutSale, ListingRanking } from "@/components/statistics/listing-ranking";
import { WeeklyTrend } from "@/components/statistics/weekly-trend";
import { getAccountAnalytics, getListingStatistics, parseAnalyticsWindow, topListings, type StatisticsWindow } from "@/lib/account-analytics";
import { getAccountContext } from "@/lib/account-context";
import { assistedCommerceEnabled } from "@/lib/payment-methods";

export const metadata = { title: "Estadísticas de tienda" };

export default async function StoreStatisticsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { profile, store } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store) redirect("/mi-cuenta/tienda");
  const days = parseAnalyticsWindow((await searchParams).periodo);
  // The rankings use the chosen period; "Todo el historial" (0) has no event window in get_listing_statistics, so they
  // fall back to the last 30 days. The weekly trend is always 12 weeks and "Contactos sin venta" always 30 days.
  const rankingDays: StatisticsWindow = days === 0 ? 30 : days;
  const [analytics, statistics] = await Promise.all([getAccountAnalytics(days), getListingStatistics(rankingDays)]);
  // Purchase requests exist only with the assisted-commerce pilot (PAY-1); without it the column would always be zero.
  const purchaseRequests = assistedCommerceEnabled() || Boolean(statistics?.listings.some((listing) => listing.purchase_requests > 0));
  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Mi tienda"
          title="Estadísticas"
          meta={<p><span className="font-semibold text-ink">{store.name}</span>. Actividad real registrada en Laria. Abajo verás qué publicaciones reciben más vistas y contactos, y cuáles conviene revisar.</p>}
        />
        <nav aria-label="Periodo de estadísticas" className="mt-4 flex flex-wrap gap-2">
          {([0, 7, 30] as const).map((period) => <ChipLink key={period} href={`/mi-cuenta/tienda/estadisticas?periodo=${period}`} selected={days === period} current="page">{period === 0 ? "Todo el historial" : `${period} días`}</ChipLink>)}
        </nav>
      </section>

      {statistics ? (
        <>
          <WeeklyTrend weekly={statistics.weekly} purchaseRequests={purchaseRequests} />
          <section aria-labelledby="ranking-publicaciones" className="space-y-3">
            <div>
              <h2 id="ranking-publicaciones" className="t-section text-ink">Tus publicaciones destacadas</h2>
              <p className="mt-1 t-meta text-ink-2">{days === 0 ? "Últimos 30 días (el historial completo no tiene ranking)." : `Últimos ${days} días.`} Cada publicación abre su edición.</p>
            </div>
            <div className={purchaseRequests ? "grid gap-4 lg:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
              <ListingRanking title="Lo más visto" rows={topListings(statistics.listings, "views")} metric="views" unit={["vista", "vistas"]} empty="Aún no hay vistas en este periodo." />
              <ListingRanking title="Lo más consultado" rows={topListings(statistics.listings, "contacts")} metric="contacts" unit={["contacto", "contactos"]} empty="Aún no hay contactos por WhatsApp en este periodo." />
              {purchaseRequests ? <ListingRanking title="Más solicitudes de compra" rows={topListings(statistics.listings, "purchase_requests")} metric="purchase_requests" unit={["solicitud", "solicitudes"]} empty="Aún no hay solicitudes de compra en este periodo." /> : null}
            </div>
            <p className="t-meta text-ink-2">{purchaseRequests ? "Los contactos son aperturas de WhatsApp sin intención de compra; las solicitudes de compra se cuentan aparte. Ninguno equivale a un mensaje ni a una venta." : "Los contactos son aperturas de WhatsApp, no mensajes ni ventas."}</p>
          </section>
          <ContactsWithoutSale data={statistics.contacts_without_sale} purchaseRequests={purchaseRequests} />
        </>
      ) : (
        <Notice tone="warning">La tendencia y el ranking de publicaciones no están disponibles en este momento. Intenta nuevamente más tarde.</Notice>
      )}

      <section aria-labelledby="metricas-tienda" className="space-y-3">
        <h2 id="metricas-tienda" className="t-section text-ink">{days === 0 ? "Totales de todo el historial" : `Totales de los últimos ${days} días`}</h2>
        <AccountAnalyticsMetrics analytics={analytics} store />
      </section>
    </div>
  );
}
