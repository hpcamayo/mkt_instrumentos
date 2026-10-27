import { statusLabel } from "@/lib/ui/status";

export type TransactionRole = "buyer" | "seller";
export type TransactionState =
  | "unattributed"
  | "pending"
  | "confirmed"
  | "verified"
  | "declined"
  | "cancelled"
  | "superseded"
  | "external";

export type EligibleBuyer = {
  buyer_user_id: string;
  display_name: string | null;
  last_contact_at: string;
  // The last three digits of the WhatsApp number the buyer wrote from, so the seller recognises the chat; null when unknown.
  phone_last3: string | null;
  // The buyer told Laria "Sí, lo compré" for this listing.
  reported_purchase: boolean;
};

// deal-trust (reach-11): a purchase confirmed with a store's counter code has no claim and no listing (claim_id,
// listing_id and slug null, attribution_type "counter"), and carries the store's slug.
export type TransactionCenterItem = {
  reference_id: string;
  claim_id: string | null;
  transaction_id: string | null;
  listing_id: string | null;
  title: string;
  slug: string | null;
  sold_at: string;
  status: TransactionState;
  attribution_type: "laria" | "external" | "counter";
  store_slug?: string | null;
  role: TransactionRole;
  seller_name: string;
  buyer_name: string | null;
  verified_at: string | null;
  review_deadline: string | null;
  own_review_submitted: boolean;
  reviews_revealed: boolean;
};

export type TransactionReview = {
  id: string;
  direction: "buyer_to_seller" | "seller_to_buyer";
  rating: number;
  comment: string | null;
  submitted_at: string;
  reviewer_name?: string | null;
};

// deal-trust (reach-11): origin "counter" is a counter purchase (get_counter_transaction_detail): no listing, the
// store's slug and the sale's lines instead.
export type TransactionDetail = {
  reference_id: string;
  listing_id: string | null;
  listing_title: string;
  listing_slug: string | null;
  origin?: "counter";
  store_slug?: string | null;
  lines?: Array<{ name: string; quantity: number }>;
  sold_at: string;
  role: TransactionRole;
  state: TransactionState;
  claim_id: string | null;
  transaction_id: string | null;
  buyer_user_id: string | null;
  buyer_name: string | null;
  seller_name: string;
  store_id: string | null;
  verified_at: string | null;
  review_deadline: string | null;
  review_window_open: boolean;
  own_review: TransactionReview | null;
  visible_reviews: TransactionReview[];
  // The seller's count of verified sales (this one included); only for role "seller", null for buyers.
  seller_verified_sales?: number | null;
};

export type PublicReputation = {
  review_count: number;
  average_rating: number | null;
  items: Array<{
    id: string;
    rating: number;
    comment: string | null;
    submitted_at: string;
    reviewer_name: string | null;
    // deal-trust (safe-06): approved review photos.
    photos?: Array<{ id: string }>;
  }>;
};

export function parseTransactionCenter(value: unknown): TransactionCenterItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTransactionCenterItem);
}

export function parseTransactionDetail(value: unknown): TransactionDetail | null {
  const counter = isRecord(value) && value.origin === "counter";
  if (!isRecord(value)
    || !isString(value.reference_id)
    || !(counter ? value.listing_id === null : isString(value.listing_id))
    || !isString(value.listing_title)
    || !(counter ? value.listing_slug === null && isString(value.store_slug) && isLines(value.lines) : isString(value.listing_slug))
    || !isDate(value.sold_at)
    || !isRole(value.role)
    || !isState(value.state)
    || !nullableString(value.claim_id)
    || !nullableString(value.transaction_id)
    || !nullableString(value.buyer_user_id)
    || !nullableString(value.buyer_name)
    || !isString(value.seller_name)
    || !nullableString(value.store_id)
    || !nullableDate(value.verified_at)
    || !nullableDate(value.review_deadline)
    || typeof value.review_window_open !== "boolean"
    || !(value.own_review === null || isReview(value.own_review))
    || !Array.isArray(value.visible_reviews)
    || !value.visible_reviews.every(isReview)
    || !(value.seller_verified_sales === undefined || value.seller_verified_sales === null || isCount(value.seller_verified_sales))) return null;
  return value as unknown as TransactionDetail;
}

// phone_last3 is null or exactly three digits (absent reads as null); reported_purchase is a boolean (absent reads as
// false). A buyer with any other shape is left out rather than shown with made-up details.
export function parseEligibleBuyers(value: unknown): EligibleBuyer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): EligibleBuyer[] => {
    if (!isRecord(item)
      || !isString(item.buyer_user_id)
      || !nullableString(item.display_name)
      || !isDate(item.last_contact_at)
      || !(item.phone_last3 === undefined || item.phone_last3 === null || (typeof item.phone_last3 === "string" && /^\d{3}$/.test(item.phone_last3)))
      || !(item.reported_purchase === undefined || typeof item.reported_purchase === "boolean")) return [];
    return [{
      buyer_user_id: item.buyer_user_id,
      display_name: item.display_name,
      last_contact_at: item.last_contact_at,
      phone_last3: typeof item.phone_last3 === "string" ? item.phone_last3 : null,
      reported_purchase: item.reported_purchase === true,
    }];
  });
}

// Whole calendar days in Lima from `now` to the review deadline: 0 is today, 1 tomorrow. Null once it has passed.
export function reviewDaysLeft(deadline: string, now: number = Date.now()): number | null {
  const end = Date.parse(deadline);
  if (!Number.isFinite(end) || end <= now) return null;
  const day = (time: number) => Date.parse(`${limaDay.format(new Date(time))}T00:00:00Z`);
  return Math.round((day(end) - day(now)) / 86_400_000);
}

// "Tu reseña vence hoy" / "mañana" / "en 3 días"; null once the window closed.
export function reviewDueLabel(deadline: string, now: number = Date.now()): string | null {
  const days = reviewDaysLeft(deadline, now);
  if (days === null) return null;
  if (days === 0) return "Tu reseña vence hoy";
  if (days === 1) return "Tu reseña vence mañana";
  return `Tu reseña vence en ${days} días`;
}

const limaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });

// The public reputation, or null when the payload is not what get_public_reputation returns (a failed call reads as
// null too): pages then leave the reviews out instead of claiming there are none (UX-4).
export function readPublicReputation(value: unknown): PublicReputation | null {
  if (!isRecord(value)
    || !isCount(value.review_count)
    || !(value.average_rating === null || isFiniteNumber(value.average_rating))
    || !Array.isArray(value.items)) return null;
  const items = value.items.filter((item): item is PublicReputation["items"][number] => (
    isRecord(item)
    && isString(item.id)
    && Number.isInteger(item.rating)
    && Number(item.rating) >= 1
    && Number(item.rating) <= 5
    && nullableString(item.comment)
    && isDate(item.submitted_at)
    && nullableString(item.reviewer_name)
  ));
  if (items.length !== value.items.length) return null;
  return { review_count: value.review_count, average_rating: value.average_rating, items };
}

export function parsePublicReputation(value: unknown): PublicReputation {
  return readPublicReputation(value) ?? emptyReputation;
}

// Labels come from the one status dictionary (lib/ui/status.ts, domain "claim").
export function transactionStateLabel(state: TransactionState) {
  return statusLabel("claim", state);
}

export function transactionErrorMessage(message: string) {
  if (message.includes("TRANSACTION_BUYER_NOT_ELIGIBLE")) return "Ese contacto no es elegible para esta publicación.";
  if (message.includes("TRANSACTION_ALREADY_VERIFIED")) return "Esta venta ya tiene una transacción verificada.";
  if (message.includes("TRANSACTION_CLAIM_FINAL")) return "Esta solicitud ya fue resuelta.";
  if (message.includes("TRANSACTION_NOT_ACCESSIBLE") || message.includes("NOT_OWNED")) return "No tienes acceso a esta transacción.";
  if (message.includes("REVIEW_ALREADY_SUBMITTED")) return "Ya enviaste tu reseña para esta transacción.";
  if (message.includes("REVIEW_WINDOW_CLOSED")) return "El plazo de 10 días para reseñar ya terminó.";
  if (message.includes("REVIEW_RATING_INVALID")) return "Selecciona una calificación entre 1 y 5.";
  if (message.includes("REPORT_ALREADY_SUBMITTED")) return "Ya reportaste esta reseña.";
  return "No pudimos completar la acción. Intenta nuevamente.";
}

const states = new Set<TransactionState>(["unattributed", "pending", "confirmed", "verified", "declined", "cancelled", "superseded", "external"]);
const emptyReputation: PublicReputation = { review_count: 0, average_rating: null, items: [] };

function isTransactionCenterItem(value: unknown): value is TransactionCenterItem {
  const counter = isRecord(value) && value.attribution_type === "counter";
  return isRecord(value)
    && isString(value.reference_id)
    && (counter ? value.claim_id === null && isString(value.transaction_id) : isString(value.claim_id))
    && nullableString(value.transaction_id)
    && (counter ? value.listing_id === null : isString(value.listing_id))
    && isString(value.title)
    && (counter ? value.slug === null && isString(value.store_slug) : isString(value.slug))
    && isDate(value.sold_at)
    && isState(value.status)
    && (value.attribution_type === "laria" || value.attribution_type === "external" || counter)
    && isRole(value.role)
    && isString(value.seller_name)
    && nullableString(value.buyer_name)
    && nullableDate(value.verified_at)
    && nullableDate(value.review_deadline)
    && typeof value.own_review_submitted === "boolean"
    && typeof value.reviews_revealed === "boolean";
}

function isLines(value: unknown) {
  return Array.isArray(value) && value.every((line) => isRecord(line) && isString(line.name) && Number.isInteger(line.quantity) && Number(line.quantity) > 0);
}

function isReview(value: unknown): value is TransactionReview {
  return isRecord(value)
    && isString(value.id)
    && (value.direction === "buyer_to_seller" || value.direction === "seller_to_buyer")
    && Number.isInteger(value.rating)
    && Number(value.rating) >= 1
    && Number(value.rating) <= 5
    && nullableString(value.comment)
    && isDate(value.submitted_at);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function isDate(value: unknown): value is string {
  return isString(value) && Number.isFinite(Date.parse(value));
}
function nullableDate(value: unknown): value is string | null {
  return value === null || isDate(value);
}
function isRole(value: unknown): value is TransactionRole {
  return value === "buyer" || value === "seller";
}
function isState(value: unknown): value is TransactionState {
  return typeof value === "string" && states.has(value as TransactionState);
}
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
