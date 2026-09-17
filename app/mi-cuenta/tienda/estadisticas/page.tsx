import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountAnalyticsMetrics } from "@/components/account-analytics";
import { getAccountAnalytics, parseAnalyticsWindow } from "@/lib/account-analytics";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Estadísticas de tienda" };

export default async function StoreStatisticsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { profile, store } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store) redirect("/mi-cuenta/tienda");
  const days = parseAnalyticsWindow((await searchParams).periodo);
  const analytics = await getAccountAnalytics(days);
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-wide text-laria-blue">{store.name}</p>
        <h1 className="mt-1 text-2xl font-black text-laria-ink">Estadísticas</h1>
        <p className="mt-2 text-sm leading-6 text-laria-text-soft">Actividad real registrada en Laria. Consulta las vistas y contactos de cada producto en tu <Link href="/mi-cuenta/tienda/inventario" className="font-black text-laria-blue">inventario</Link>.</p>
        <nav aria-label="Periodo de estadísticas" className="mt-4 flex flex-wrap gap-2">
          {([0, 7, 30] as const).map((period) => <Link key={period} href={`/mi-cuenta/tienda/estadisticas?periodo=${period}`} aria-current={days === period ? "page" : undefined} className={days === period ? "laria-button-primary min-h-11 px-4 py-2 text-sm" : "laria-button-secondary min-h-11 px-4 py-2 text-sm"}>{period === 0 ? "Todo el historial" : `${period} días`}</Link>)}
        </nav>
      </section>
      <AccountAnalyticsMetrics analytics={analytics} store />
    </div>
  );
}
