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
