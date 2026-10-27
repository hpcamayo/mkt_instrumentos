// PAY-1, assisted commerce Pilot A (docs/store-operations/pay-1.md): the payment methods a verified store accepts and
// the "Solicitar compra" WhatsApp message. Laria shows methods as facts; it never handles money, links or accounts.
import { absoluteUrl } from "@/lib/site";
import { whatsAppUrl } from "@/lib/seller-contact";

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

// ------------------------------------------------------------------ buy-09 "Cuotas"

// A verified store that takes credit cards may offer interest-free installments, reviewed by Laria like a method
// (store-floor, docs/feature-ideas/store-floor.md). Only interest-free offers exist: with interest the TCEA would have
// to be shown. The store's card provider runs them; Laria shows the offer and the amount per installment, nothing more.

// The methods a buyer can pay in installments with; an offer is public only while one of them is approved.
export const CARD_PAYMENT_METHODS: readonly PaymentMethod[] = ["pos_tarjeta_al_recoger", "link_de_pago"];

// The numbers a store can choose (the database takes 2 to 36).
export const INSTALLMENT_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36] as const;

// The credit cards a store may name, in this spelling (laria_private.installment_card_options). None: any credit card.
export const INSTALLMENT_CARDS = [
  "BCP", "BBVA", "Interbank", "Scotiabank", "BanBif", "Banco Pichincha", "Diners Club", "American Express",
  "Banco Falabella", "Banco Ripley", "Tarjeta Oh",
] as const;

export type InstallmentOffer = { maxInstallments: number; cards: string[]; minPricePen: number | null };

// The row returned by get_store_installment_offer (or the owner's and Admin's rows), or null.
export function readInstallmentOffer(value: unknown): InstallmentOffer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const max = record.max_installments;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 2 || max > 36) return null;
  const cards = Array.isArray(record.cards)
    ? INSTALLMENT_CARDS.filter((card) => (record.cards as unknown[]).includes(card))
    : [];
  const min = record.min_price_pen;
  return { maxInstallments: max, cards: [...cards], minPricePen: typeof min === "number" && min > 0 ? min : null };
}

// Soles with the cents only when there are any, grouped like the prices ("S/ 1,250", "S/ 358.25"). Written out
// instead of Intl so the server and the browser always print the same text.
export function formatInstallmentAmount(value: number) {
  const cents = Math.round(value * 100);
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = cents % 100;
  return `S/ ${whole}${rest ? `.${rest.toString().padStart(2, "0")}` : ""}`;
}

// "o 12 cuotas sin intereses de S/ 358.25": the price split evenly, rounded to the cent.
export function installmentLine(pricePen: number | null | undefined, installments: number | null | undefined) {
  if (!pricePen || pricePen <= 0 || !installments || installments < 2) return null;
  return `o ${installments} cuotas sin intereses de ${formatInstallmentAmount(pricePen / installments)}`;
}

function joinWithO(items: readonly string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} o ${items[items.length - 1]}` : items[0] ?? "";
}

// The store's offer as one sentence, for its store page and the methods box of its listings.
export function installmentOfferText(offer: InstallmentOffer) {
  const cards = offer.cards.length ? `con tarjetas de crédito ${joinWithO(offer.cards)}` : "con tarjeta de crédito";
  const from = offer.minPricePen ? `, en compras desde ${formatInstallmentAmount(offer.minPricePen)}` : "";
  return `Hasta ${offer.maxInstallments} cuotas sin intereses ${cards}${from}.`;
}

// maxQuantity (stock-23): the most units the buyer can ask for, what is available up to 10. Never shown as a number.
export type PurchaseRequest = { methods: PublicPaymentMethod[]; sku: string | null; maxQuantity: number };

export const PURCHASE_MAX_QUANTITY = 10;

export function clampPurchaseQuantity(value: unknown, max: number) {
  const top = Math.max(1, Math.min(Math.trunc(max) || 1, PURCHASE_MAX_QUANTITY));
  return typeof value === "number" && Number.isInteger(value) ? Math.max(1, Math.min(value, top)) : 1;
}

export function readPurchaseRequest(value: unknown): PurchaseRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const methods = readPublicPaymentMethods(record.methods);
  if (!methods.length) return null;
  const max = typeof record.max_quantity === "number" ? record.max_quantity : 1;
  return { methods, sku: typeof record.sku === "string" && record.sku ? record.sku : null, maxQuantity: clampPurchaseQuantity(max, PURCHASE_MAX_QUANTITY) };
}

// Pilot switch. Off unless the deployment sets LARIA_ASSISTED_COMMERCE=1, so merging this code changes nothing for
// buyers or stores until the owner turns the pilot on (after the legal review of the Terms and Privacy drafts). The
// database has its own switch (laria_private.set_assisted_commerce_pilot, off by default): with it off, owners cannot
// propose methods and nothing is public, whatever the app shows. Turning the pilot on needs both.
export function assistedCommerceEnabled() {
  return process.env.LARIA_ASSISTED_COMMERCE?.trim() === "1";
}

// The prefilled "Solicitar compra" message (design §11.1): title, SKU when the listing is linked to inventory,
// quantity and link. The buyer picks the quantity next to the button (stock-23) and can still change it in WhatsApp.
export function buildPurchaseMessage(listing: { title: string; slug: string }, sku: string | null, quantity = 1) {
  return [
    `Hola, quiero comprar "${listing.title}" que vi en Laria.`,
    ...(sku ? [`SKU: ${sku}`] : []),
    `Cantidad: ${clampPurchaseQuantity(quantity, PURCHASE_MAX_QUANTITY)}`,
    absoluteUrl(`/instrumentos/${listing.slug}`),
    "¿Me confirmas la disponibilidad y cómo coordinamos el pago y la entrega?",
  ].join("\n");
}

export function buildPurchaseWhatsAppUrl(phone: string, listing: { title: string; slug: string }, sku: string | null, quantity = 1) {
  return whatsAppUrl(phone, buildPurchaseMessage(listing, sku, quantity));
}

// The same link with another quantity, for the stepper (stock-23): the link opens WhatsApp at once (talk-03).
export function withPurchaseQuantity(href: string, quantity: number) {
  return href.replace(/Cantidad%3A%20\d+/, `Cantidad%3A%20${clampPurchaseQuantity(quantity, PURCHASE_MAX_QUANTITY)}`);
}

// ------------------------------------------------------------------ stock-05 ready-made replies

export type ReplyStore = { name: string; address: string | null; district: string | null; city: string | null; pickup_hours: string | null };
export type ReplyMethod = { method: PaymentMethod; provider_label: string | null; holder_name: string | null };
export type ReadyReply = { shortcut: string; title: string; text: string };

// Copyable WhatsApp replies for purchase requests, filled with what the store already told Laria: its approved
// methods, the account holder, the pickup address and hours. Like Laria itself they carry no numbers, accounts or
// links (D-7): the store adds those in the chat. "[equipo]" is left for the owner to fill, as WhatsApp Business
// quick replies are fixed text.
export function readyReplies(store: ReplyStore, methods: ReplyMethod[]): ReadyReply[] {
  const place = [store.address, store.district, store.city].filter(Boolean).join(", ");
  const hours = store.pickup_hours ? ` Nuestro horario: ${store.pickup_hours}.` : "";
  const accepted = methods.map((entry) => paymentMethodText(entry).toLowerCase());
  const list = accepted.length > 1 ? `${accepted.slice(0, -1).join(", ")} o ${accepted[accepted.length - 1]}` : accepted[0] ?? "";
  const replies: ReadyReply[] = [
    {
      shortcut: "/disponible",
      title: "Sí, está disponible",
      text: `Hola, gracias por escribir a ${store.name}. Sí, tenemos [equipo] disponible.${list ? ` Puedes pagar con ${list}.` : ""} ¿Cómo prefieres coordinar el pago y la entrega?`,
    },
  ];
  for (const entry of methods) {
    const holder = entry.holder_name ? ` a nombre de ${entry.holder_name}` : "";
    if (entry.method === "yape_plin") {
      replies.push({ shortcut: "/yape", title: `Para pagar por ${entry.provider_label ?? "Yape o Plin"}`, text: `Para pagar por ${entry.provider_label ?? "Yape o Plin"}, te paso el número${holder} en este chat. Cuando pagues, envíanos la captura y te confirmamos tu pedido.` });
    } else if (entry.method === "link_de_pago") {
      replies.push({ shortcut: "/enlace", title: "Para pagar con enlace", text: `Te enviamos por este chat un enlace de pago${entry.provider_label ? ` de ${entry.provider_label}` : ""}${holder}. Al completarlo, te confirmamos tu pedido.` });
    } else if (entry.method === "pos_tarjeta_al_recoger") {
      replies.push({ shortcut: "/tarjeta", title: "Pago con tarjeta al recoger", text: `Puedes pagar con tarjeta al recoger${place ? ` en ${place}` : " en nuestra tienda"}.${hours}` });
    } else if (entry.method === "efectivo_al_recoger") {
      replies.push({ shortcut: "/efectivo", title: "Pago en efectivo al recoger", text: `Puedes pagar en efectivo al recoger${place ? ` en ${place}` : " en nuestra tienda"}.${hours}` });
    }
  }
  if (place) replies.push({ shortcut: "/recojo", title: "Dónde recoger", text: `Puedes recogerlo en ${place}.${hours} Te esperamos.` });
  replies.push({ shortcut: "/agotado", title: "Ya no está disponible", text: "Gracias por escribirnos. Por ahora no tenemos [equipo]; te avisamos por aquí apenas vuelva a llegar." });
  return replies;
}

// Database errors read "PAYMENT_CODE: mensaje en español". Only those known messages reach the person; anything else
// (permissions, transport) becomes the generic fallback and stays in the server log.
export function paymentErrorMessage(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";
  if (message === "ADMIN_REQUIRED") return "No tienes permisos para revisar medios de pago.";
  const match = /^(PAYMENT_[A-Z_]+|STORE_NOT_FOUND): ([\s\S]+)$/.exec(message);
  return match ? match[2] : fallback;
}
