import { Notice } from "@/components/ui/notice";
import type { AccountAnalytics } from "@/lib/account-analytics";

const numbers = new Intl.NumberFormat("es-PE");
const percentages = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 });
const dates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

export function AccountAnalyticsMetrics({ analytics, store = false }: { analytics: AccountAnalytics | null; store?: boolean }) {
  if (!analytics) {
    return <Notice tone="warning">Las métricas no están disponibles en este momento. Intenta nuevamente más tarde.</Notice>;
  }
  const { summary } = analytics;
  return (
    <section className="space-y-4" aria-label={store ? "Métricas de tienda" : "Resumen de publicaciones"}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Publicaciones activas" value={numbers.format(summary.active)} detail="Estado actual: aprobadas y públicas." />
        <Metric label="Vistas de publicaciones" value={numbers.format(summary.views)} detail={analytics.days === 0 ? "Acumuladas, incluidas las vistas históricas." : `Registradas en los últimos ${analytics.days} días.`} />
        <Metric label="Contactos por WhatsApp" value={numbers.format(summary.contacts)} detail="Aperturas de contacto registradas; no mensajes ni ventas." />
        <Metric label="Publicaciones vendidas" value={numbers.format(summary.sold)} detail="Estado actual marcado por el vendedor; no ventas verificadas." />
        <Metric label="Ventas verificadas en Laria" value={numbers.format(summary.verified_transactions)} detail="Compras que comprador y vendedor reconocieron; no confirma pago ni entrega." />
        <Metric label="Contacto a venta verificada" value={formatRatio(summary.contact_to_verified_rate)} detail="Relaciones verificadas ÷ aperturas de WhatsApp registradas en el mismo periodo." />
        <Metric label="Favoritos actuales" value={numbers.format(summary.favorites)} detail="Publicaciones guardadas ahora; incluye historial no público. No identifica compradores." />
        <Metric label="Guardados en el periodo" value={numbers.format(summary.favorite_additions)} detail="Acciones de guardar registradas; no compradores únicos ni favoritos actuales." />
        <Metric label="Retirados en el periodo" value={numbers.format(summary.favorite_removals)} detail="Acciones de quitar registradas." />
        <Metric label="Tasa de favoritos" value={formatRatio(summary.favorite_rate)} detail="Acciones de guardar ÷ vistas registradas, en el mismo periodo." />
        {store ? <>
          <Metric label="Impresiones de publicaciones" value={numbers.format(summary.impressions)} detail="Apariciones registradas en tarjetas visibles." />
          <Metric label="Visitas a la tienda" value={numbers.format(summary.store_views)} detail="Aperturas registradas de la página pública." />
          <Metric label="Contactos a la tienda" value={numbers.format(summary.store_contacts)} detail="Contactos desde la página pública de la tienda." />
          <Metric label="Vistas por impresión" value={formatRatio(summary.ctr)} detail="Vistas registradas de publicaciones ÷ impresiones." />
          <Metric label="Tasa de contacto" value={formatRatio(summary.contact_rate)} detail="Contactos ÷ vistas registradas de publicaciones." />
        </> : null}
      </div>
      <div className="rounded-panel border border-subtle bg-white p-4 text-meta leading-6 text-ink-2">
        <p>{analytics.days === 0 ? "Periodo: todo el historial disponible." : `Periodo de eventos: últimos ${analytics.days} días.`} Las publicaciones activas y vendidas muestran el estado actual de todo tu inventario, no cambios ocurridos en el periodo.</p>
        <p>{analytics.tracking_started_at ? `Registro de eventos disponible desde el ${dates.format(new Date(analytics.tracking_started_at))}.` : "Todavía no hay eventos registrados."} Los contactos cuentan intención de abrir WhatsApp, no conversaciones, compradores únicos ni transacciones.</p>
        {store ? <p>Las tasas usan solo vistas e impresiones registradas en el mismo periodo; excluyen las vistas históricas sin evento. Sin denominador se muestra «Sin datos». Laria no calcula ingresos ni garantiza pagos, entregas o condición del equipo.</p> : null}
      </div>
    </section>
  );
}

// Labels are sentence case: uppercase is only for micro labels of three words or fewer (D6).
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-panel border border-subtle bg-white p-5"><p className="t-ui font-semibold text-ink-2">{label}</p><p className="mt-3 text-[28px] font-bold leading-[32px] stretch-semicond tabular-nums text-ink">{value}</p><p className="mt-2 text-meta leading-5 text-ink-2">{detail}</p></div>;
}

function formatRatio(value: number | null) {
  return value === null ? "Sin datos" : percentages.format(value);
}
