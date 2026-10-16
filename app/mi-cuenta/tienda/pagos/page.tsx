import { notFound, redirect } from "next/navigation";
import { StorePaymentMethods, type OwnerPaymentMethod } from "@/components/payment/store-payment-methods-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { assistedCommerceEnabled, isPaymentMethod } from "@/lib/payment-methods";

export const metadata = { title: "Pagos" };

// Pagos (PAY-1, Pilot A, docs/store-operations/pay-1.md; review fix B6): everything about how buyers pay the store,
// in its own entry of the store account menu. Hidden, with the menu entry, until the pilot switch is on.
export default async function StorePaymentsPage() {
  if (!assistedCommerceEnabled()) notFound();
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");

  const { data, error } = await supabase
    .from("store_payment_methods")
    .select("method,status,holder_name,provider_label,owner_note,review_reason")
    .eq("store_id", store.id);
  const methods = (data ?? []).filter((row) => isPaymentMethod(row.method)) as OwnerPaymentMethod[];
  const verified = store.status === "active" && store.is_verified === true;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Mi tienda"
        title="Pagos"
        meta={<p className="max-w-[68ch]">Cómo pueden pagarte los compradores que te encuentran en Laria.</p>}
      />
      {!verified ? (
        <Notice tone="warning" role="note">
          Solo las tiendas verificadas pueden mostrar medios de pago. Cuando Laria verifique tu tienda podrás agregarlos aquí. Puedes dejar de aceptar un medio en cualquier momento.
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger">No pudimos cargar tus medios de pago. Intenta nuevamente.</Notice>
      ) : (
        <StorePaymentMethods methods={methods} canEdit={verified} />
      )}
      <section aria-labelledby="pagos-como-funciona" className="grid gap-3 rounded-panel bg-canvas p-5 sm:p-6">
        <h2 id="pagos-como-funciona" className="t-section text-ink">Cómo funciona «Solicitar compra»</h2>
        <ul className="grid max-w-[68ch] list-disc gap-1.5 pl-5 t-body text-ink">
          <li>Con al menos un medio aprobado, tus publicaciones con unidades disponibles muestran «Solicitar compra» y los medios que aceptas.</li>
          <li>El comprador te escribe por WhatsApp con el nombre del equipo, su SKU y la cantidad.</li>
          <li>Tú confirmas la disponibilidad, el pago, el comprobante y la entrega. Si usas un enlace de pago, lo envías en esa conversación: Laria no lo muestra.</li>
          <li>Laria no procesa pagos ni recibe dinero.</li>
        </ul>
      </section>
    </div>
  );
}
