// listing-details (docs/feature-ideas/listing-details.md): a listing's sale terms, as the seller states them.
//   sell-07 "Precio fijo o conversable"   price mode, shown beside the price on the card and the listing.
//   buy-02  "Cómo se entrega"             pickup or try-out (a district, never an address), delivery in Lima and who
//                                         pays it, shipping to provinces (Shalom, Olva or another agency; paid when
//                                         sending or at the agency), "Se puede probar".
//   sell-06 "Acepto cambios por..."       trades: what the seller would take, in their words and categories.
// Laria never handles the money, the parcel or the trade, and guarantees none of it: these are the seller's words.
// Stored on the listing (20261202120200) through the "sale_terms" listing detail. Pure, so the forms, the routes,
// the pages and the tests share it.

import { hasContactDetails } from "@/lib/listing-questions";
import { categoryOptions } from "@/lib/listings";

export const LIMA_DELIVERY = ["buyer", "seller", "agree"] as const;
export const CARRIERS = ["shalom", "olva", "other"] as const;
export const SHIPPING_PAYMENT = ["origin", "destination"] as const;
// The catalog's categories (the database checks the same through listing_taxonomy_is_valid, 20261202120800).
export const TRADE_CATEGORIES: readonly string[] = categoryOptions.map((option) => option.value);

export type LimaDelivery = (typeof LIMA_DELIVERY)[number];
export type Carrier = (typeof CARRIERS)[number];
export type ShippingPayment = (typeof SHIPPING_PAYMENT)[number];

// What the sell and edit forms hold and send (the database writer's keys).
export type SaleTerms = {
  price_mode: "fixed" | "negotiable" | null;
  pickup: boolean;
  pickup_area: string;
  can_try: boolean;
  lima_delivery: LimaDelivery | null;
  ships_provinces: boolean;
  carriers: Carrier[];
  shipping_payment: ShippingPayment | null;
  accepts_trades: boolean;
  trade_wants: string;
  trade_categories: string[];
};

// The listing columns, as pages read them (text columns the database checks; read back through oneOf).
export type ListingSaleTerms = {
  price_mode?: string | null;
  delivery_pickup?: boolean | null;
  pickup_area?: string | null;
  can_try?: boolean | null;
  lima_delivery?: string | null;
  ships_provinces?: boolean | null;
  shipping_carriers?: string[] | null;
  shipping_payment?: string | null;
  accepts_trades?: boolean | null;
  trade_wants?: string | null;
  trade_categories?: string[] | null;
};

export const SALE_TERMS_COLUMNS =
  "price_mode,delivery_pickup,pickup_area,can_try,lima_delivery,ships_provinces,shipping_carriers,shipping_payment,accepts_trades,trade_wants,trade_categories";

export const PICKUP_AREA_MAX = 60;
export const TRADE_WANTS_MAX = 200;

// Nothing said: no switch on, no choice made (no pre-ticked option, ever).
export function emptySaleTerms(): SaleTerms {
  return {
    price_mode: null,
    pickup: false,
    pickup_area: "",
    can_try: false,
    lima_delivery: null,
    ships_provinces: false,
    carriers: [],
    shipping_payment: null,
    accepts_trades: false,
    trade_wants: "",
    trade_categories: [],
  };
}

// The other way round: a form's terms as the listing's columns (the sell form's preview).
export function saleTermsColumns(value: SaleTerms): ListingSaleTerms {
  return {
    price_mode: value.price_mode,
    delivery_pickup: value.pickup,
    pickup_area: value.pickup_area.trim() || null,
    can_try: value.can_try,
    lima_delivery: value.lima_delivery,
    ships_provinces: value.ships_provinces,
    shipping_carriers: value.ships_provinces ? value.carriers : [],
    shipping_payment: value.ships_provinces ? value.shipping_payment : null,
    accepts_trades: value.accepts_trades,
    trade_wants: value.accepts_trades ? value.trade_wants.trim() || null : null,
    trade_categories: value.accepts_trades ? value.trade_categories : [],
  };
}

export function saleTermsFromListing(listing: ListingSaleTerms): SaleTerms {
  return {
    price_mode: oneOf(["fixed", "negotiable"] as const, listing.price_mode),
    pickup: Boolean(listing.delivery_pickup),
    pickup_area: listing.pickup_area ?? "",
    can_try: Boolean(listing.can_try),
    lima_delivery: oneOf(LIMA_DELIVERY, listing.lima_delivery),
    ships_provinces: Boolean(listing.ships_provinces),
    carriers: (listing.shipping_carriers ?? []).filter((value): value is Carrier => (CARRIERS as readonly string[]).includes(value)),
    shipping_payment: oneOf(SHIPPING_PAYMENT, listing.shipping_payment),
    accepts_trades: Boolean(listing.accepts_trades),
    trade_wants: listing.trade_wants ?? "",
    trade_categories: (listing.trade_categories ?? []).filter((value) => (TRADE_CATEGORIES as readonly string[]).includes(value)),
  };
}

// A form value as saved in a draft (on the device or in listing_drafts), read leniently: known keys only, text kept
// as typed so the seller can still fix it. cleanSaleTerms decides what may be sent.
export function readSaleTerms(input: unknown): SaleTerms {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  return {
    price_mode: oneOf(["fixed", "negotiable"] as const, raw.price_mode),
    pickup: raw.pickup === true,
    pickup_area: text(raw.pickup_area),
    can_try: raw.can_try === true,
    lima_delivery: oneOf(LIMA_DELIVERY, raw.lima_delivery),
    ships_provinces: raw.ships_provinces === true,
    carriers: CARRIERS.filter((carrier) => list(raw.carriers).includes(carrier)),
    shipping_payment: oneOf(SHIPPING_PAYMENT, raw.shipping_payment),
    accepts_trades: raw.accepts_trades === true,
    trade_wants: text(raw.trade_wants),
    trade_categories: TRADE_CATEGORIES.filter((category) => list(raw.trade_categories).includes(category)),
  };
}

// The delivery and trade terms without the price mode: what "Usar lo de tu última publicación" copies, since a
// seller's delivery terms rarely change but each price is its own.
export function deliveryTermsOnly(value: SaleTerms): SaleTerms {
  return { ...value, price_mode: null };
}

// Where the device remembers the last published terms, per account and kind.
export function lastSaleTermsKey(ownerId: string, kind: "listing" | "store_listing") {
  return `laria:entrega:${ownerId}:${kind}`;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;
const squash = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

export type SaleTermsResult = { ok: true; value: SaleTerms } | { ok: false; field: keyof SaleTerms; message: string };

// The form's values as the database will store them: switched-off parts dropped, text trimmed, lists known and
// unique. Refuses what the database would (contact details, lengths), with a message for the field.
export function cleanSaleTerms(input: unknown): SaleTermsResult {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const value = emptySaleTerms();
  value.price_mode = oneOf(["fixed", "negotiable"] as const, raw.price_mode);
  value.pickup = raw.pickup === true;
  value.can_try = raw.can_try === true;
  value.pickup_area = value.pickup || value.can_try ? squash(raw.pickup_area) : "";
  value.lima_delivery = oneOf(LIMA_DELIVERY, raw.lima_delivery);
  value.ships_provinces = raw.ships_provinces === true;
  if (value.ships_provinces) {
    const carriers = Array.isArray(raw.carriers) ? raw.carriers : [];
    value.carriers = CARRIERS.filter((carrier) => carriers.includes(carrier));
    value.shipping_payment = oneOf(SHIPPING_PAYMENT, raw.shipping_payment);
  }
  value.accepts_trades = raw.accepts_trades === true;
  if (value.accepts_trades) {
    value.trade_wants = squash(raw.trade_wants);
    const categories = Array.isArray(raw.trade_categories) ? raw.trade_categories : [];
    value.trade_categories = TRADE_CATEGORIES.filter((category) => categories.includes(category));
  }

  if (value.pickup_area.length > PICKUP_AREA_MAX) return { ok: false, field: "pickup_area", message: `Escribe el distrito o la zona en ${PICKUP_AREA_MAX} caracteres o menos.` };
  if (value.pickup_area.length === 1) return { ok: false, field: "pickup_area", message: "Escribe el distrito o la zona." };
  if (value.pickup_area && hasContactDetails(value.pickup_area)) return { ok: false, field: "pickup_area", message: "Indica solo el distrito o la zona, sin teléfonos, correos ni enlaces." };
  if (value.trade_wants.length > TRADE_WANTS_MAX) return { ok: false, field: "trade_wants", message: `Cuéntalo en ${TRADE_WANTS_MAX} caracteres o menos.` };
  if (value.trade_wants.length === 1) return { ok: false, field: "trade_wants", message: "Cuenta qué aceptarías en cambio." };
  if (value.trade_wants && hasContactDetails(value.trade_wants)) return { ok: false, field: "trade_wants", message: "Describe el cambio sin teléfonos, correos ni enlaces. El comprador te escribe por el botón de contacto." };
  return { ok: true, value };
}

// The writer's JSON (laria_private.write_listing_sale_terms): every key, so the stored terms are exactly these.
export function saleTermsPayload(value: SaleTerms) {
  return {
    price_mode: value.price_mode,
    pickup: value.pickup,
    pickup_area: value.pickup_area || null,
    can_try: value.can_try,
    lima_delivery: value.lima_delivery,
    ships_provinces: value.ships_provinces,
    carriers: value.carriers,
    shipping_payment: value.shipping_payment,
    accepts_trades: value.accepts_trades,
    trade_wants: value.trade_wants || null,
    trade_categories: value.trade_categories,
  };
}

export function sameSaleTerms(a: SaleTerms, b: SaleTerms) {
  return JSON.stringify(saleTermsPayload(a)) === JSON.stringify(saleTermsPayload(b));
}

export function hasSaleTerms(value: SaleTerms) {
  return Boolean(value.price_mode || value.pickup || value.can_try || value.lima_delivery || value.ships_provinces || value.accepts_trades);
}

// ------------------------------------------------------------------ copy

export const PRICE_MODE_LABELS = { fixed: "Precio fijo", negotiable: "Precio conversable" } as const;
export const LIMA_DELIVERY_LABELS: Record<LimaDelivery, string> = {
  buyer: "Delivery en Lima, lo paga el comprador",
  seller: "Delivery en Lima sin costo para el comprador",
  agree: "Delivery en Lima, el costo se conversa",
};
export const LIMA_DELIVERY_CHOICES: Record<LimaDelivery, string> = {
  buyer: "Lo paga el comprador",
  seller: "Lo pago yo",
  agree: "Lo conversamos",
};
export const CARRIER_LABELS: Record<Carrier, string> = { shalom: "Shalom", olva: "Olva Courier", other: "Otra agencia" };
export const SHIPPING_PAYMENT_LABELS: Record<ShippingPayment, string> = {
  origin: "el envío se paga al enviar",
  destination: "el envío se paga al recoger en la agencia",
};
export const SHIPPING_PAYMENT_CHOICES: Record<ShippingPayment, string> = {
  origin: "Se paga al enviar",
  destination: "Se paga al recoger en la agencia",
};

export type SaleTermLine = { key: "pickup" | "try" | "lima" | "provinces" | "trades"; title: string; detail?: string };

// What the listing page lists under "Cómo se entrega", in the seller's terms. Nothing when nothing was said.
export function saleTermLines(terms: ListingSaleTerms, categoryLabel: (value: string) => string = (value) => value): SaleTermLine[] {
  const value = saleTermsFromListing(terms);
  const lines: SaleTermLine[] = [];
  const area = value.pickup_area ? ` en ${value.pickup_area}` : "";
  if (value.pickup) lines.push({ key: "pickup", title: `Recojo${area}`, detail: "Coordina el lugar y la hora por WhatsApp." });
  if (value.can_try) lines.push({ key: "try", title: `Se puede probar${value.pickup ? "" : area}`, detail: "Pruébalo antes de pagar." });
  if (value.lima_delivery) lines.push({ key: "lima", title: LIMA_DELIVERY_LABELS[value.lima_delivery] });
  if (value.ships_provinces) {
    const carriers = value.carriers.map((carrier) => (carrier === "other" ? "otra agencia" : CARRIER_LABELS[carrier]));
    const by = carriers.length ? ` por ${listJoin(carriers)}` : "";
    lines.push({ key: "provinces", title: `Envía a provincia${by}`, detail: value.shipping_payment ? capitalize(SHIPPING_PAYMENT_LABELS[value.shipping_payment]) + "." : undefined });
  }
  if (value.accepts_trades) {
    const categories = value.trade_categories.map(categoryLabel);
    const wants = value.trade_wants && !/[.!?…]$/.test(value.trade_wants) ? `${value.trade_wants}.` : value.trade_wants;
    const detail = [wants, categories.length ? `Categorías: ${listJoin(categories)}.` : ""].filter(Boolean).join(" ");
    lines.push({ key: "trades", title: "Acepta cambios", detail: detail || undefined });
  }
  return lines;
}

// talk-02's quick questions a listing already answers, so the contact module doesn't offer them (lib/contact-message.ts
// quickQuestions ids): the price mode answers "¿El precio es negociable?", shipping "¿Haces envíos a provincia?" and a
// try-out "¿Puedo probarlo?".
export function answeredQuestionIds(terms: ListingSaleTerms) {
  const ids: string[] = [];
  if (terms.price_mode) ids.push("precio");
  if (terms.ships_provinces) ids.push("envio");
  if (terms.can_try) ids.push("probar");
  return ids;
}

// "Shalom, Olva Courier u Otra agencia": Spanish writes "u" before a word starting with an o sound.
function listJoin(items: string[]) {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")} ${/^h?o/i.test(last) ? "u" : "o"} ${last}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
