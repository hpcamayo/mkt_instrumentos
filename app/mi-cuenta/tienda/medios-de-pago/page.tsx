import { notFound, redirect } from "next/navigation";
import { StorePaymentMethodsForm, type OwnerPaymentMethod } from "@/components/payment/store-payment-methods-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { assistedCommerceEnabled, isPaymentMethod } from "@/lib/payment-methods";

export const metadata = { title: "Medios de pago" };

// PAY-1, Pilot A (docs/store-operations/pay-1.md). Hidden until the pilot switch is on.
export default async function StorePaymentMethodsPage() {
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
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Mi tienda"
          title="Medios de pago"
          meta={<p className="max-w-[68ch]">Indica cómo pueden pagarte los compradores. Laria revisa cada medio antes de mostrarlo en tu tienda y en tus publicaciones, y vuelve a revisarlo cada vez que lo cambias.</p>}
        />
        <p className="mt-4 max-w-[68ch] t-body text-ink-2">
          Con al menos un medio aprobado, tus publicaciones con unidades disponibles muestran «Solicitar compra»: el comprador te escribe por WhatsApp con el nombre, la referencia y la cantidad. Tú confirmas la disponibilidad, el pago, el comprobante y la entrega. Laria no procesa pagos ni recibe dinero.
        </p>
      </section>
      {!verified ? (
        <Notice tone="warning" role="note">
          Solo las tiendas verificadas pueden mostrar medios de pago. Puedes dejar de aceptar un medio en cualquier momento.
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger">No pudimos cargar tus medios de pago. Intenta nuevamente.</Notice>
      ) : (
        <StorePaymentMethodsForm methods={methods} canEdit={verified} />
      )}
    </div>
  );
}
