import { Wallet } from "lucide-react";
import { installmentOfferText, paymentMethodText, type InstallmentOffer, type PublicPaymentMethod } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

// PAY-1 (design §11.1): the methods an Admin approved for a verified store, as plain facts, with the statement that the
// buyer pays the store directly. Rendered only when the store currently shows at least one method.
export const PAYMENT_DISCLAIMER =
  "Pagas directamente a la tienda. Laria no procesa pagos, no retiene dinero ni emite comprobantes: la boleta o factura, los cambios y los reclamos son con la tienda.";

export function AcceptedPaymentMethods({
  methods,
  installments = null,
  headingLevel = 2,
  className,
}: {
  methods: PublicPaymentMethod[];
  // store-floor, buy-09: the store's interest-free installments, when it shows them.
  installments?: InstallmentOffer | null;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  if (!methods.length) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby="medios-de-pago" className={cn("grid gap-2 rounded-panel bg-canvas p-4", className)}>
      <Heading id="medios-de-pago" className="flex items-center gap-2 t-ui font-semibold text-ink">
        <Wallet aria-hidden="true" className="h-4 w-4 shrink-0" />
        Medios de pago que acepta la tienda
      </Heading>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 t-ui text-ink">
        {methods.map((item) => (
          <li key={item.method}>{paymentMethodText(item)}</li>
        ))}
      </ul>
      {installments ? <p className="t-ui text-ink">{installmentOfferText(installments)} Las cobra el proveedor de tarjetas de la tienda.</p> : null}
      <p className="t-meta">{PAYMENT_DISCLAIMER}</p>
    </section>
  );
}
