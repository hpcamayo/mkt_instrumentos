// The WhatsApp opening message (talk-01) and the optional quick questions (talk-02). Pure, so the server (the page and
// the contact route) and the browser (the chips) build the same text.
import { formatPrice } from "@/lib/price";
import { absoluteUrl } from "@/lib/site";

type MessageListing = { title: string; slug: string; price_pen: number | null; seller_type: "individual" | "store" };

// "Hola, vi tu Boss DS-1 en Laria a S/ 299: https://laria.audio/instrumentos/boss-ds-1 ¿Sigue disponible?" The seller
// knows which item and at what price before answering. A store is addressed as "su"; a price to agree is left out.
// talk-06: on a reserved listing the buyer says they saw the reservation (docs/ux-effortless/maybes-reservado.md).
export function listingContactMessage(listing: MessageListing, options: { outOfStock?: boolean; reserved?: boolean } = {}) {
  const yours = listing.seller_type === "store" ? "su" : "tu";
  const price = listing.price_pen === null ? "" : ` a ${formatPrice(listing.price_pen)}`;
  const link = absoluteUrl(`/instrumentos/${listing.slug}`);
  return options.outOfStock
    ? `Hola, vi ${yours} ${listing.title} en Laria${price}: ${link} Aparece agotado. ¿Volverá a estar disponible?`
    : options.reserved
      ? `Hola, vi ${yours} ${listing.title} en Laria${price}: ${link} Vi que está reservado. Si se libera, ¿me avisas?`
      : `Hola, vi ${yours} ${listing.title} en Laria${price}: ${link} ¿Sigue disponible?`;
}

// talk-07 "Hacer una oferta": "Hola, te ofrezco S/ 1,900 por tu Fender Stratocaster publicado en Laria: <link>". Only
// on a Particular's listing. The amount lives in this text alone: the contact is recorded like the main button's.
export function offerContactMessage(listing: { title: string; slug: string }, amount: number) {
  return `Hola, te ofrezco ${formatPrice(amount)} por tu ${listing.title} publicado en Laria: ${absoluteUrl(`/instrumentos/${listing.slug}`)}`;
}

// Three round amounts under the price: 95, 90 and 85 % of it, rounded down to a step that suits the price
// (S/ 2,000 offers 1,900, 1,800 and 1,700). Whole numbers throughout, so nothing rounds the wrong way.
export function offerSuggestions(price: number | null) {
  if (price === null || !Number.isSafeInteger(price) || price <= 0) return [];
  const step = price >= 2000 ? 100 : price >= 500 ? 50 : price >= 100 ? 10 : 5;
  const amounts = [95, 90, 85].map((percent) => Math.floor((price * percent) / (100 * step)) * step);
  return [...new Set(amounts)].filter((amount) => amount > 0 && amount < price);
}

// A wa.me link with its whole text replaced (the offer). Other links are returned unchanged.
export function withMessage(href: string, message: string) {
  try {
    const url = new URL(href);
    if (url.hostname !== "wa.me") return href;
    url.searchParams.set("text", message);
    return url.toString().replace(/\+/g, "%20");
  } catch {
    return href;
  }
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
