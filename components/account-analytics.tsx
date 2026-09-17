import type { AccountAnalytics } from "@/lib/account-analytics";

const numbers = new Intl.NumberFormat("es-PE");
const percentages = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 });
const dates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

export function AccountAnalyticsMetrics({ analytics, store = false }: { analytics: AccountAnalytics | null; store?: boolean }) {
  if (!analytics) {
    return <section role="status" className="rounded-lg border border-laria-fog bg-white p-5 text-sm text-laria-text-soft">Las métricas no están disponibles en este momento. Intenta nuevamente más tarde.</section>;
  }
  const { summary } = analytics;
  return (
    <section className="space-y-4" aria-label={store ? "Métricas de tienda" : "Resumen de publicaciones"}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Publicaciones activas" value={numbers.format(summary.active)} detail="Estado actual: aprobadas y públicas." />
        <Metric label="Vistas de publicaciones" value={numbers.format(summary.views)} detail={analytics.days === 0 ? "Acumuladas, incluidas las vistas históricas." : `Registradas en los últimos ${analytics.days} días.`} />
        <Metric label="Contactos por WhatsApp" value={numbers.format(summary.contacts)} detail="Aperturas de contacto registradas; no mensajes ni ventas." />
        <Metric label="Publicaciones vendidas" value={numbers.format(summary.sold)} detail="Estado actual marcado por el vendedor; no ventas verificadas." />
        {store ? <>
          <Metric label="Impresiones de productos" value={numbers.format(summary.impressions)} detail="Apariciones registradas en tarjetas visibles." />
          <Metric label="Visitas a la tienda" value={numbers.format(summary.store_views)} detail="Aperturas registradas de la página pública." />
          <Metric label="Contactos a la tienda" value={numbers.format(summary.store_contacts)} detail="Contactos desde la página pública de la tienda." />
          <Metric label="CTR de productos" value={formatRatio(summary.ctr)} detail="Vistas registradas de productos ÷ impresiones." />
          <Metric label="Tasa de contacto" value={formatRatio(summary.contact_rate)} detail="Contactos de productos ÷ vistas registradas de productos." />
        </> : null}
      </div>
      <div className="rounded-lg border border-laria-fog bg-white p-4 text-xs leading-6 text-laria-text-soft">
        <p>{analytics.days === 0 ? "Periodo: todo el historial disponible." : `Periodo de eventos: últimos ${analytics.days} días.`} Las publicaciones activas y vendidas muestran el estado actual de todo tu inventario, no cambios ocurridos en el periodo.</p>
        <p>{analytics.tracking_started_at ? `Registro de eventos disponible desde el ${dates.format(new Date(analytics.tracking_started_at))}.` : "Todavía no hay eventos registrados."} Los contactos cuentan intención de abrir WhatsApp, no conversaciones, compradores únicos ni transacciones.</p>
        {store ? <p>Las tasas usan solo vistas e impresiones registradas en el mismo periodo; excluyen las vistas históricas sin evento. Sin denominador se muestra «Sin datos». Laria no calcula ingresos ni garantiza pagos, entregas o condición de los productos.</p> : null}
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-laria-text-soft">{label}</p><p className="mt-3 text-2xl font-black text-laria-ink">{value}</p><p className="mt-2 text-xs leading-5 text-laria-text-soft">{detail}</p></div>;
}

function formatRatio(value: number | null) {
  return value === null ? "Sin datos" : percentages.format(value);
}
