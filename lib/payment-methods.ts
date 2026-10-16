// PAY-1, assisted commerce Pilot A (docs/store-operations/pay-1.md): the payment methods a verified store accepts and
// the "Solicitar compra" WhatsApp message. Laria shows methods as facts; it never handles money, links or accounts.
import { absoluteUrl } from "@/lib/site";

export const PAYMENT_METHODS = ["efectivo_al_recoger", "yape_plin", "pos_tarjeta_al_recoger", "link_de_pago"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo_al_recoger: "Efectivo al recoger",
  yape_plin: "Yape o Plin",
  pos_tarjeta_al_recoger: "Tarjeta con POS al recoger",
  // Pilot A shows no links on Laria (D-7): the store sends its provider's link in the WhatsApp conversation.
  link_de_pago: "Enlace de pago que envía la tienda",
};

export const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  efectivo_al_recoger: "El comprador paga en tu local al recoger.",
  yape_plin: "El comprador paga desde su app; tú le das el número por WhatsApp.",
  pos_tarjeta_al_recoger: "El comprador paga con tarjeta en tu local.",
  link_de_pago: "Envías el enlace de tu proveedor por WhatsApp. Laria no lo muestra.",
};

// The providers a store may name next to a method; the database accepts only these (laria_private.payment_provider_options,
// review fix A2), stored in this spelling. Free text would let a phone number or a link through. Cash has none.
export const PAYMENT_PROVIDER_OPTIONS: Record<PaymentMethod, readonly string[]> = {
  efectivo_al_recoger: [],
  yape_plin: ["Yape", "Plin", "Yape y Plin"],
  pos_tarjeta_al_recoger: ["Izipay", "Niubiz", "Culqi", "Mercado Pago", "OpenPay"],
  link_de_pago: ["Izipay", "Niubiz", "Culqi", "Mercado Pago", "OpenPay", "PayPal"],
};

export function isPaymentProvider(method: PaymentMethod, value: unknown): value is string {
  return typeof value === "string" && PAYMENT_PROVIDER_OPTIONS[method].includes(value);
}

// Cash goes to the store's till; every other method has an account holder the Admin compares with the razón social.
export function paymentMethodNeedsHolder(method: PaymentMethod) {
  return method !== "efectivo_al_recoger";
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export type PublicPaymentMethod = { method: PaymentMethod; provider_label: string | null };

// The rows returned by get_store_payment_methods / get_listing_purchase_request, in the canonical order.
export function readPublicPaymentMethods(value: unknown): PublicPaymentMethod[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const { method, provider_label: provider } = item as Record<string, unknown>;
      return isPaymentMethod(method) ? [{ method, provider_label: typeof provider === "string" && provider ? provider : null }] : [];
    })
    .sort((a, b) => PAYMENT_METHODS.indexOf(a.method) - PAYMENT_METHODS.indexOf(b.method));
}

export function paymentMethodText(item: PublicPaymentMethod) {
  const label = PAYMENT_METHOD_LABELS[item.method];
  return item.provider_label ? `${label} (${item.provider_label})` : label;
}

export type PurchaseRequest = { methods: PublicPaymentMethod[]; sku: string | null };

export function readPurchaseRequest(value: unknown): PurchaseRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const methods = readPublicPaymentMethods(record.methods);
  if (!methods.length) return null;
  return { methods, sku: typeof record.sku === "string" && record.sku ? record.sku : null };
}

// Pilot switch. Off unless the deployment sets LARIA_ASSISTED_COMMERCE=1, so merging this code changes nothing for
// buyers or stores until the owner turns the pilot on (after the legal review of the Terms and Privacy drafts). The
// database has its own switch (laria_private.set_assisted_commerce_pilot, off by default): with it off, owners cannot
// propose methods and nothing is public, whatever the app shows. Turning the pilot on needs both.
export function assistedCommerceEnabled() {
  return process.env.LARIA_ASSISTED_COMMERCE?.trim() === "1";
}

// The prefilled "Solicitar compra" message (design §11.1): title, SKU when the listing is linked to inventory,
// quantity and link. Quantity starts at 1; the buyer can change it in WhatsApp before sending.
export function buildPurchaseMessage(listing: { title: string; slug: string }, sku: string | null) {
  return [
    `Hola, quiero comprar "${listing.title}" que vi en Laria.`,
    ...(sku ? [`SKU: ${sku}`] : []),
    "Cantidad: 1",
    absoluteUrl(`/instrumentos/${listing.slug}`),
    "¿Me confirmas la disponibilidad y cómo coordinamos el pago y la entrega?",
  ].join("\n");
}

export function buildPurchaseWhatsAppUrl(phone: string, listing: { title: string; slug: string }, sku: string | null) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(buildPurchaseMessage(listing, sku))}`;
}

// Database errors read "PAYMENT_CODE: mensaje en español". Only those known messages reach the person; anything else
// (permissions, transport) becomes the generic fallback and stays in the server log.
export function paymentErrorMessage(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";
  if (message === "ADMIN_REQUIRED") return "No tienes permisos para revisar medios de pago.";
  const match = /^(PAYMENT_[A-Z_]+|STORE_NOT_FOUND): ([\s\S]+)$/.exec(message);
  return match ? match[2] : fallback;
}
