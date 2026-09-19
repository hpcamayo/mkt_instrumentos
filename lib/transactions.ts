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
};

export type TransactionCenterItem = {
  reference_id: string;
  claim_id: string;
  transaction_id: string | null;
  listing_id: string;
  title: string;
  slug: string;
  sold_at: string;
  status: TransactionState;
  attribution_type: "laria" | "external";
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

export type TransactionDetail = {
  reference_id: string;
  listing_id: string;
  listing_title: string;
  listing_slug: string;
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
  }>;
};

export function parseTransactionCenter(value: unknown): TransactionCenterItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTransactionCenterItem);
}

export function parseTransactionDetail(value: unknown): TransactionDetail | null {
  if (!isRecord(value)
    || !isString(value.reference_id)
    || !isString(value.listing_id)
    || !isString(value.listing_title)
    || !isString(value.listing_slug)
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
    || !value.visible_reviews.every(isReview)) return null;
  return value as unknown as TransactionDetail;
}

export function parseEligibleBuyers(value: unknown): EligibleBuyer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is EligibleBuyer => (
    isRecord(item)
    && isString(item.buyer_user_id)
    && nullableString(item.display_name)
    && isDate(item.last_contact_at)
  ));
}

export function parsePublicReputation(value: unknown): PublicReputation {
  if (!isRecord(value)
    || !isCount(value.review_count)
    || !(value.average_rating === null || isFiniteNumber(value.average_rating))
    || !Array.isArray(value.items)) return emptyReputation;
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
  if (items.length !== value.items.length) return emptyReputation;
  return { review_count: value.review_count, average_rating: value.average_rating, items };
}

export function transactionStateLabel(state: TransactionState) {
  return ({
    unattributed: "Venta sin atribuir",
    pending: "Comprador pendiente de confirmar",
    confirmed: "Compra confirmada",
    verified: "Transacción verificada por ambas partes",
    declined: "El contacto indicó que no fue comprador",
    cancelled: "Solicitud cancelada",
    superseded: "Solicitud reemplazada",
    external: "Venta fuera de Laria",
  } as const)[state];
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
  return isRecord(value)
    && isString(value.reference_id)
    && isString(value.claim_id)
    && nullableString(value.transaction_id)
    && isString(value.listing_id)
    && isString(value.title)
    && isString(value.slug)
    && isDate(value.sold_at)
    && isState(value.status)
    && (value.attribution_type === "laria" || value.attribution_type === "external")
    && isRole(value.role)
    && isString(value.seller_name)
    && nullableString(value.buyer_name)
    && nullableDate(value.verified_at)
    && nullableDate(value.review_deadline)
    && typeof value.own_review_submitted === "boolean"
    && typeof value.reviews_revealed === "boolean";
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
