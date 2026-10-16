import { notFound, redirect } from "next/navigation";
import { assistedCommerceEnabled } from "@/lib/payment-methods";

// The PAY-1 owner page moved to Pagos (review fix B6); old links keep working while the pilot is on.
export default function StorePaymentMethodsPage() {
  if (!assistedCommerceEnabled()) notFound();
  redirect("/mi-cuenta/tienda/pagos");
}
