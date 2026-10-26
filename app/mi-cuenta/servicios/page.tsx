import { MyServices, ServiceIntro } from "@/components/services/my-services";
import { ServiceBookings } from "@/components/services/service-bookings";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { readOwnerServices, readServiceBookings, SERVICE_CATEGORIES } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";

export const metadata = { title: "Servicios" };

const SAVED: Record<string, string> = {
  nuevo: "Enviamos tu servicio a revisión. Te avisaremos cuando Moderación lo apruebe.",
  revision: "Guardamos los cambios y tu servicio volvió a revisión.",
  cambios: "Guardamos los cambios.",
};

// bet-02 (docs/feature-ideas/services.md): Mi cuenta › Servicios. The account's services (one per kind) and the
// "Contraté este servicio" confirmations it takes part in, as provider or as client. A store offers services as itself
// once its request exists.
export default async function MyServicesPage({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const [{ supabase, profile, store }, query] = await Promise.all([getAccountContext(), searchParams]);
  const saved = query.guardado ? SAVED[query.guardado] : undefined;
  const storeWithoutRequest = profile?.account_type === "store_owner" && !store;
  const [servicesResult, bookingsResult] = supabase
    ? await Promise.all([servicesDb(supabase).rpc("get_my_services"), servicesDb(supabase).rpc("get_my_service_bookings")])
    : [null, null];
  const failed = !servicesResult || Boolean(servicesResult.error) || Boolean(bookingsResult?.error);
  const services = readOwnerServices(servicesResult?.data);
  const bookings = readServiceBookings(bookingsResult?.data);
  const canAdd = !storeWithoutRequest && services.length < SERVICE_CATEGORIES.length;

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Servicios"
        meta={<ServiceIntro hasServices={services.length > 0} />}
        actions={canAdd && services.length ? <Button href="/mi-cuenta/servicios/nuevo" variant="secondary">Ofrecer otro servicio</Button> : null}
      />
      {saved ? <Notice tone="success" role="status">{saved}</Notice> : null}
      {failed ? <Notice tone="danger" role="alert">No pudimos cargar tus servicios. Intenta nuevamente.</Notice> : null}
      {storeWithoutRequest ? (
        <Notice tone="info" title="Primero envía la solicitud de tu tienda">
          Tu tienda ofrece sus servicios con su nombre y su verificación. Envía la solicitud en Mi tienda y vuelve aquí.
        </Notice>
      ) : null}
      {!failed && !storeWithoutRequest && services.length === 0 ? (
        <EmptyState
          title="Aún no ofreces servicios"
          description="Clases, luthería y reparaciones, salas de ensayo, estudios de grabación o sonido para eventos. Publicarlo es gratis y los músicos te escriben directo por WhatsApp."
          actions={<Button href="/mi-cuenta/servicios/nuevo">Ofrecer un servicio</Button>}
        />
      ) : null}
      {services.length ? (
        <section aria-labelledby="mis-servicios" className="grid gap-3">
          <h2 id="mis-servicios" className="t-section text-ink">Mis servicios</h2>
          <MyServices services={services} />
        </section>
      ) : null}
      <section aria-labelledby="contrataciones-titulo" id="contrataciones" className="grid scroll-mt-4 gap-3">
        <h2 id="contrataciones-titulo" className="t-section text-ink">Contrataciones</h2>
        <p className="max-w-3xl t-meta">
          Confirmar una contratación habilita la reseña del cliente durante 30 días. Laria no verifica el pago ni el
          trabajo, y nunca recibe dinero.
        </p>
        <ServiceBookings bookings={bookings} />
      </section>
    </section>
  );
}
