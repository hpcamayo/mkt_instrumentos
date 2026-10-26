// The WhatsApp opening message (talk-01) and the optional quick questions (talk-02). Pure, so the server (the page and
// the contact route) and the browser (the chips) build the same text.
import { formatPrice } from "@/lib/price";
import { absoluteUrl } from "@/lib/site";

type MessageListing = { title: string; slug: string; price_pen: number | null; seller_type: "individual" | "store" };

// "Hola, vi tu Boss DS-1 en Laria a S/ 299: https://laria.audio/instrumentos/boss-ds-1 ¿Sigue disponible?" The seller
// knows which item and at what price before answering. A store is addressed as "su"; a price to agree is left out.
export function listingContactMessage(listing: MessageListing, options: { outOfStock?: boolean } = {}) {
  const yours = listing.seller_type === "store" ? "su" : "tu";
  const price = listing.price_pen === null ? "" : ` a ${formatPrice(listing.price_pen)}`;
  const link = absoluteUrl(`/instrumentos/${listing.slug}`);
  return options.outOfStock
    ? `Hola, vi ${yours} ${listing.title} en Laria${price}: ${link} Aparece agotado. ¿Volverá a estar disponible?`
    : `Hola, vi ${yours} ${listing.title} en Laria${price}: ${link} ¿Sigue disponible?`;
}

export type QuickQuestion = { id: string; text: string };

// Optional chips under the contact button (talk-02). Each one adds its question to the message; none is preselected.
export function quickQuestions(sellerType: "individual" | "store"): QuickQuestion[] {
  const store = sellerType === "store";
  return [
    { id: "probar", text: store ? "¿Puedo probarlo en la tienda?" : "¿Puedo probarlo?" },
    { id: "envio", text: store ? "¿Hacen envíos a provincia?" : "¿Haces envíos a provincia?" },
    { id: "estuche", text: "¿Incluye estuche o funda?" },
    { id: "precio", text: "¿El precio es negociable?" },
  ];
}

// Adds the chosen questions to a wa.me link's text, in the order shown. Other links are returned unchanged.
export function withQuestions(href: string, questions: string[]) {
  if (questions.length === 0) return href;
  try {
    const url = new URL(href);
    if (url.hostname !== "wa.me") return href;
    const text = url.searchParams.get("text") ?? "";
    url.searchParams.set("text", [text, ...questions].filter(Boolean).join(" "));
    // URLSearchParams writes spaces as "+", which WhatsApp shows literally on some clients.
    return url.toString().replace(/\+/g, "%20");
  } catch {
    return href;
  }
}

// The one-time safety sheet (talk-04) appears before the first contact about something expensive, or before a
// purchase request.
export const SAFETY_PRICE_PEN = 1000;
export function needsSafetySheet(pricePen: number | null, purchase: boolean) {
  return purchase || (pricePen !== null && pricePen >= SAFETY_PRICE_PEN);
}

// sell-06 "Te propongo un cambio": one more chip when the listing accepts trades. It adds the opening of a proposal;
// the buyer says what they offer in WhatsApp. Laria takes no part in the trade.
export function tradeQuestion(sellerType: "individual" | "store"): QuickQuestion {
  return { id: "cambio", text: sellerType === "store" ? "Les propongo un cambio." : "Te propongo un cambio." };
}

// buy-01: the combo's one WhatsApp message, every item with its price and link, then the seller's own discount when
// they offer one. The sum is of published prices; what is paid is agreed with the seller.
export type ComboMessageItem = { title: string; slug: string; price_pen: number | null };

export function comboContactMessage(
  items: readonly ComboMessageItem[],
  sellerType: "individual" | "store",
  offer?: { discount_percent: number; min_items: number } | null,
) {
  const store = sellerType === "store";
  const lines = items.map((item) => `• ${item.title}${item.price_pen === null ? "" : `, ${formatPrice(item.price_pen)}`}: ${absoluteUrl(`/instrumentos/${item.slug}`)}`);
  const prices = items.map((item) => item.price_pen);
  const sum = prices.every((price) => price !== null) ? prices.reduce<number>((total, price) => total + (price ?? 0), 0) : null;
  const ask = offer && items.length >= offer.min_items
    ? store
      ? `Vi que ofrecen ${offer.discount_percent}% de descuento llevando ${offer.min_items} o más. ¿Siguen disponibles?`
      : `Vi que ofreces ${offer.discount_percent}% de descuento llevando ${offer.min_items} o más. ¿Siguen disponibles?`
    : store
      ? "¿Siguen disponibles? ¿Me harían un precio por todo?"
      : "¿Siguen disponibles? ¿Me harías un precio por todo?";
  return [
    `Hola, vi ${store ? "estas publicaciones de su tienda" : "estas publicaciones tuyas"} en Laria y me interesan juntos:`,
    ...lines,
    ...(sum !== null && items.length > 1 ? [`Suma de precios publicados: ${formatPrice(sum)}.`] : []),
    ask,
  ].join("\n");
}
