import Link from "next/link";
import { redirect } from "next/navigation";
import { StoreTryoutAgenda } from "@/components/store-floor/tryout-agenda";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { hoursSummary } from "@/lib/store-floor/tryouts";
import { loadStoreTryouts, loadTryoutSettings } from "@/lib/store-floor/tryouts-server";

export const metadata = { title: "Pruebas en tienda" };

// buy-07: the store's try-out agenda. Requests first (confirm in one tap), then the days ahead.
export default async function StoreTryoutsPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const [settings, agenda] = await Promise.all([loadTryoutSettings(supabase, store.id), loadStoreTryouts(supabase, store.id)]);
  const anything = agenda.requested.length + agenda.upcoming.length + agenda.past.length > 0;
  return (
    <div className="grid w-full max-w-3xl gap-6">
      <PageHeader
        eyebrow="Mi tienda"
        title="Pruebas"
        meta={settings.enabled
          ? <p className="max-w-[68ch]">Recibes reservas: {hoursSummary(settings.weekly_hours)}. Una prueba reserva un horario, no el instrumento.</p>
          : <p className="max-w-[68ch]">Quien mira una publicación con stock puede pedir un horario para probarla en tu tienda. Por ahora está apagado.</p>}
        actions={<Link href="/mi-cuenta/tienda/pruebas/horario" className={buttonClasses({ variant: settings.enabled ? "secondary" : "primary" })}>{settings.enabled ? "Horario y ajustes" : "Activar pruebas"}</Link>}
      />
      {anything ? (
        <StoreTryoutAgenda requested={agenda.requested} upcoming={agenda.upcoming} past={agenda.past} />
      ) : (
        <EmptyState
          title={settings.enabled ? "Aún no hay pruebas" : "Recibe a quien quiere probar antes de comprar"}
          description={settings.enabled
            ? "Cuando alguien pida una prueba, te avisamos aquí, en Notificaciones y por correo."
            : "Elige los días y horas en que puedes atender pruebas. Confirmas cada una con un toque y escribes al cliente por WhatsApp con los detalles."}
        />
      )}
    </div>
  );
}
