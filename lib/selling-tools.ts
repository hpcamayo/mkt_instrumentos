// Selling tools batch of the feature ideas (docs/feature-ideas/selling-tools.md): Mi equipo (sell-01), offers from
// stores (sell-02), consignment (sell-03), price steps (sell-04), private offers (sell-05), gear reminders (buy-06) and
// part payment (run-04). Shapes, labels and pure helpers shared by pages, components and tests. Plain module.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { getCategoryLabel } from "@/lib/listings";
import { formatPrice } from "@/lib/price";

export type RpcError = { message: string; code?: string };

// The new tables and functions are not in the generated Database type yet, so they are read through an untyped view
// of the same client, like the inventory ones (lib/store-inventory.ts). RLS and the functions decide what anyone sees.
export function sellingDb(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

// The database raises "CODE: Mensaje en español."; the part after the code is written for people. Anything else
// (a network error, a policy) gets the caller's own sentence.
export function sellingErrorMessage(error: RpcError | null | undefined, fallback: string) {
  const match = /^[A-Z][A-Z0-9_]+: ([\s\S]+)$/.exec(error?.message?.trim() ?? "");
  return match ? match[1] : fallback;
}

export function sellingErrorCode(error: RpcError | null | undefined) {
  return /^([A-Z][A-Z0-9_]+):/.exec(error?.message ?? "")?.[1] ?? null;
}

// ------------------------------------------------------------------ Mi equipo

export type GearItem = {
  id: string;
  source: "manual" | "purchase";
  category: string;
  instrument_type: string;
  brand: string;
  model: string;
  title: string;
  serial: string | null;
  purchased_on: string | null;
  warranty_until: string | null;
  note: string | null;
  sale_listing_id: string | null;
  source_listing_id: string | null;
  created_at: string;
};

export type GearReminder = {
  gear_item_id: string;
  kind: ReminderKind;
  every_months: number;
  last_changed_on: string;
  next_due_on: string;
};

export const GEAR_COLUMNS = "id,source,category,instrument_type,brand,model,title,serial,purchased_on,warranty_until,note,sale_listing_id,source_listing_id,created_at";
export const GEAR_LIMIT = 200;

export type ReminderKind = "strings" | "reeds" | "drumheads";

// Mirrors public.gear_reminder_kind.
export function reminderKind(instrumentType: string): ReminderKind | null {
  if (["electric_guitar", "acoustic_guitar", "bass", "string_instrument"].includes(instrumentType)) return "strings";
  if (instrumentType === "winds") return "reeds";
  if (instrumentType === "drums") return "drumheads";
  return null;
}

export const REMINDER_LABELS: Record<ReminderKind, { noun: string; the: string; them: "las" | "los"; defaultMonths: number }> = {
  strings: { noun: "Cuerdas", the: "las cuerdas", them: "las", defaultMonths: 3 },
  reeds: { noun: "Cañas", the: "las cañas", them: "las", defaultMonths: 1 },
  drumheads: { noun: "Parches", the: "los parches", them: "los", defaultMonths: 6 },
};

// The type choices of a category, always ending with "Otro".
export function gearTypeOptions(category: string) {
  const options = getInstrumentTypeOptions(category);
  return options.some((option) => option.value === "other") ? options : [...options, { value: "other", label: "Otro" }];
}

// "Guitarras · Guitarras eléctricas", or just the category when the type is "Otro".
export function gearKindLabel(item: Pick<GearItem, "category" | "instrument_type">) {
  const type = item.instrument_type === "other" ? null : gearTypeOptions(item.category).find((option) => option.value === item.instrument_type)?.label;
  return [getCategoryLabel(item.category), type].filter(Boolean).join(" · ");
}

// The warranty line on an item: still running, ending soon or over. Dates are plain calendar days.
export function warrantyStatus(warrantyUntil: string | null, today: string): { label: string; tone: "neutral" | "warning" | "muted" } | null {
  if (!warrantyUntil) return null;
  if (warrantyUntil < today) return { label: `Garantía vencida el ${formatCalendarDate(warrantyUntil)}`, tone: "muted" };
  const days = Math.round((Date.parse(`${warrantyUntil}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days <= 30) return { label: `Garantía hasta el ${formatCalendarDate(warrantyUntil)}`, tone: "warning" };
  return { label: `Garantía hasta el ${formatCalendarDate(warrantyUntil)}`, tone: "neutral" };
}

// ------------------------------------------------------------------ offers from stores

export const TRADE_CATEGORIES = ["guitars", "basses", "amplifiers", "pedals", "keyboards"] as const;
export type TradeCategory = (typeof TRADE_CATEGORIES)[number];
export function isTradeCategory(value: string): value is TradeCategory {
  return (TRADE_CATEGORIES as readonly string[]).includes(value);
}

export const CONSUMABLE_OPTIONS: readonly { value: ReminderKind; label: string }[] = [
  { value: "strings", label: "Cuerdas" },
  { value: "reeds", label: "Cañas" },
  { value: "drumheads", label: "Parches" },
];

export type TradeKind = "sell" | "part_payment";
export type TradeStatus = "open" | "accepted" | "completed" | "not_completed" | "withdrawn" | "expired";
export type OfferStatus = "sent" | "accepted" | "declined" | "withdrawn";

export const TRADE_PHOTO_MIN = 2;
export const TRADE_PHOTO_MAX = 6;

export type TradeListingRef = { id: string; title: string; slug: string; price_pen?: number | null };

export type TradeRequestSummary = {
  id: string;
  kind: TradeKind;
  title: string;
  category: string;
  status: TradeStatus;
  offers_until: string;
  decide_until: string;
  drop_off_by: string | null;
  created_at: string;
  photo: string | null;
  listing: TradeListingRef | null;
  offer_count: number;
  best_offer_pen: number | null;
};

export type TradeOfferForSeller = {
  id: string;
  amount_pen: number;
  note: string | null;
  status: OfferStatus;
  created_at: string;
  store: { id: string; name: string; slug: string; city: string | null; district: string | null; is_verified: boolean };
  contact: { whatsapp_phone: string | null; address: string | null; district: string | null; city: string | null; opening_hours: string | null } | null;
};

export type TradeRequestDetail = {
  id: string;
  kind: TradeKind;
  title: string;
  category: string;
  instrument_type: string;
  brand: string;
  model: string;
  condition: string;
  description: string;
  asking_price_pen: number | null;
  city: string | null;
  region: string;
  photos: string[];
  status: TradeStatus;
  offers_until: string;
  decide_until: string;
  accepted_at: string | null;
  drop_off_by: string | null;
  final_price_pen: number | null;
  close_reason?: string | null;
  created_at: string;
  listing: TradeListingRef | null;
};

export type MyTradeRequest = TradeRequestDetail & { stores_reached: number; offers: TradeOfferForSeller[] };

export type StoreInboxItem = {
  id: string;
  kind: TradeKind;
  title: string;
  category: string;
  condition: string;
  city: string | null;
  region: string;
  asking_price_pen: number | null;
  photo: string | null;
  status: TradeStatus;
  offers_until: string;
  created_at: string;
  listing: TradeListingRef | null;
  my_offer: { id: string; amount_pen: number; status: OfferStatus } | null;
};

export type StoreTradeRequest = TradeRequestDetail & {
  my_offer: { id: string; amount_pen: number; note: string | null; status: OfferStatus } | null;
  contact: { name: string; whatsapp_phone: string | null } | null;
};

export type StoreTradeSettings = {
  store_id: string;
  buys_used: boolean;
  buy_categories: string[];
  consignment: boolean;
  part_payment: boolean;
  consumables: string[];
  note: string | null;
};

export const EMPTY_TRADE_SETTINGS: Omit<StoreTradeSettings, "store_id"> = {
  buys_used: false,
  buy_categories: [],
  consignment: false,
  part_payment: false,
  consumables: [],
  note: null,
};

// What a request's state means to the person who sent it.
export function tradeStatusLabel(status: TradeStatus, kind: TradeKind = "sell") {
  switch (status) {
    case "open": return kind === "sell" ? "Recibiendo ofertas" : "Esperando respuesta";
    case "accepted": return "Oferta elegida";
    case "completed": return kind === "sell" ? "Vendido" : "Entregado";
    case "not_completed": return "No se concretó";
    case "withdrawn": return "Retirado";
    case "expired": return "Venció";
  }
}

// The same request as the store sees it.
export function storeTradeStatusLabel(item: Pick<StoreInboxItem, "status" | "my_offer" | "offers_until">, now = Date.now()) {
  if (item.my_offer?.status === "accepted") return item.status === "accepted" ? "Eligieron tu oferta" : tradeStatusLabel(item.status);
  if (item.my_offer?.status === "declined") return "Eligieron otra oferta";
  if (item.status !== "open") return tradeStatusLabel(item.status);
  if (item.my_offer?.status === "sent") return "Oferta enviada";
  return Date.parse(item.offers_until) > now ? "Nuevo" : "Cerrado para ofertas";
}

export function offerStatusLabel(status: OfferStatus) {
  return { sent: "Oferta", accepted: "Elegida", declined: "No elegida", withdrawn: "Retirada" }[status];
}

// Photos are private: they are read through the session-checked route.
export function tradePhotoUrl(path: string) {
  return `/api/trade-photos/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function tradePhotoPath(userId: string, requestId: string, slot: number) {
  return `${userId}/${requestId}/${slot}.jpg`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const TRADE_PHOTO_PATH = new RegExp(`^${UUID}/${UUID}/[1-6]\\.jpg$`);

// ------------------------------------------------------------------ consignment

export type MyConsignment = {
  id: string;
  status: "invited" | "active" | "sold" | "ended";
  accepted_at: string | null;
  ended_at: string | null;
  listing: { id: string; title: string; slug: string; price_pen: number | null; status: string; published_at: string | null; sold_at: string | null };
  store: { name: string; slug: string; city: string | null; whatsapp_phone: string | null };
  views: number;
  contacts: number;
  saves: number;
};

export type StoreListingConsignment = {
  id: string;
  status: "invited" | "active" | "sold" | "ended";
  invite_expires_at: string | null;
  accepted_at: string | null;
  owner_name: string | null;
};

export function consignmentInvitePath(token: string) {
  return `/mi-cuenta/equipo/consignacion/${token}`;
}

export function consignmentInviteMessage(storeName: string, listingTitle: string, url: string) {
  return `Hola, soy de ${storeName}. Publicamos tu ${listingTitle} en consignación en Laria. Con este enlace ves sus visitas y contactos desde tu cuenta: ${url}`;
}

export function consignmentStatusLabel(status: MyConsignment["status"]) {
  return { invited: "Invitación enviada", active: "En consignación", sold: "Vendido", ended: "Terminada" }[status];
}

// ------------------------------------------------------------------ price steps

export type PriceStepsRule = {
  listing_id: string;
  floor_pen: number;
  step_percent: 5 | 10;
  interval_days: 7 | 14;
  only_without_contacts: boolean;
  status: "active" | "paused" | "finished";
  finished_reason: "floor" | "sold" | "unavailable" | null;
  start_price_pen: number;
  steps_taken: number;
  next_step_at: string;
  last_step_at: string | null;
};

// Mirrors public.listing_price_step_next: one step down, whole soles, never below the floor.
export function priceStepNext(price: number, floor: number, percent: number) {
  return Math.max(floor, Math.floor((price * (100 - percent)) / 100));
}

// The prices the rule would go through, at most `limit` steps, ending at the floor.
export function priceStepSchedule(price: number, floor: number, percent: number, limit = 12) {
  const steps: number[] = [];
  let current = price;
  while (current > floor && steps.length < limit) {
    const next = priceStepNext(current, floor, percent);
    if (next >= current) break;
    steps.push(next);
    current = next;
  }
  return steps;
}

export function priceStepsStatusLabel(rule: Pick<PriceStepsRule, "status" | "finished_reason">) {
  if (rule.status === "active") return "Activa";
  if (rule.status === "paused") return "En pausa";
  return rule.finished_reason === "floor" ? "Llegó a tu precio mínimo" : rule.finished_reason === "sold" ? "Terminó: se vendió" : "Terminó";
}

export function priceStepsSummary(rule: Pick<PriceStepsRule, "step_percent" | "interval_days" | "only_without_contacts" | "floor_pen">) {
  return `${rule.step_percent}% cada ${rule.interval_days} días${rule.only_without_contacts ? " sin contactos" : ""}, hasta ${formatPrice(rule.floor_pen)}`;
}

// ------------------------------------------------------------------ private offers

export type PrivateOfferAudience = {
  saves: number;
  price_pen: number | null;
  is_public: boolean;
  last_offer: { id: string; price_pen: number; valid_until: string; status: "active" | "cancelled"; recipient_count: number; created_at: string } | null;
  next_allowed_at: string | null;
};

export type ReceivedPrivateOffer = { id: string; price_pen: number; public_price_pen: number; valid_until: string; message: string | null };

// The WhatsApp message the person sends to take the offer: it quotes the offer so the seller recognises it.
export function privateOfferMessage(title: string, offer: Pick<ReceivedPrivateOffer, "price_pen" | "valid_until">) {
  return `Hola, recibí tu oferta en Laria por “${title}”: ${formatPrice(offer.price_pen)} hasta el ${formatCalendarDate(limaDate(offer.valid_until))}. ¿Sigue en pie?`;
}

// The listing's contact link with the offer's message instead of the usual one.
export function withWhatsAppMessage(href: string, message: string) {
  try {
    const url = new URL(href);
    if (url.hostname !== "wa.me") return href;
    url.searchParams.set("text", message);
    return url.toString();
  } catch {
    return href;
  }
}

// ------------------------------------------------------------------ the selling tools at a glance

export type ListingSellingTools = {
  price_steps: PriceStepsRule["status"] | null;
  private_offer: "active" | null;
  consignment: "invited" | "active" | null;
  part_payment: boolean | null;
  trade_requests: number;
  saves: number;
};

export type ListingSellingPublic = {
  consignment: { store_name: string; store_slug: string } | null;
  part_payment: boolean;
  private_offer: ReceivedPrivateOffer | null;
  is_owner: boolean;
};

// Short tags for a row in Mis publicaciones and Inventario.
export function sellingToolTags(tools: ListingSellingTools | undefined) {
  if (!tools) return [];
  const tags: string[] = [];
  if (tools.price_steps === "active") tags.push("Bajada automática");
  if (tools.price_steps === "paused") tags.push("Bajada en pausa");
  if (tools.private_offer === "active") tags.push("Oferta enviada");
  if (tools.consignment === "active") tags.push("En consignación");
  if (tools.consignment === "invited") tags.push("Consignación por aceptar");
  if (tools.trade_requests > 0) tags.push(tools.trade_requests === 1 ? "1 pedido de parte de pago" : `${tools.trade_requests} pedidos de parte de pago`);
  return tags;
}

export function sellingToolsPath(listingId: string) {
  return `/mi-cuenta/publicaciones/${listingId}/herramientas`;
}

// ------------------------------------------------------------------ dates

const LIMA = "America/Lima";

// The calendar day in Lima of an instant.
export function limaDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LIMA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function todayInLima(now = new Date()) {
  return limaDate(now.toISOString());
}

// "30 de octubre" for a YYYY-MM-DD day.
export function formatCalendarDate(day: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(`${day.slice(0, 10)}T12:00:00Z`));
}

// "30 de octubre, 15:00" in Lima.
export function formatLimaDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")} de ${value("month")}, ${value("hour")}:${value("minute")}`;
}
