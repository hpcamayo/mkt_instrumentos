import Link from "next/link";
import { ChipLink } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
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
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow={store.name}
          title="Estadísticas"
          meta={<p>Actividad real registrada en Laria. Consulta las vistas y contactos de cada publicación en tu <Link href="/mi-cuenta/tienda/inventario" className="link font-semibold">inventario</Link>.</p>}
        />
        <nav aria-label="Periodo de estadísticas" className="mt-4 flex flex-wrap gap-2">
          {([0, 7, 30] as const).map((period) => <ChipLink key={period} href={`/mi-cuenta/tienda/estadisticas?periodo=${period}`} selected={days === period} current="page">{period === 0 ? "Todo el historial" : `${period} días`}</ChipLink>)}
        </nav>
      </section>
      <AccountAnalyticsMetrics analytics={analytics} store />
    </div>
  );
}
