// Deal-trust batch (docs/feature-ideas/deal-trust.md): what the seller page, the seller level, the buyer track
// record, review photos, the history of a publication, safe meetups and counter purchase codes read from the
// database, and the words they use. Plain module: server pages and client parts both import it.
import { absoluteUrl } from "@/lib/site";

export type SellerLevel = { kind: "particular" | "store"; since: string };
export type ReviewPhoto = { id: string };
export type SafeSpotMark = { note: string | null; since: string | null };

export type ProvenanceOriginal = {
  category: string | null;
  instrumentType: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  attributes: Record<string, unknown>;
  publishedAt: string | null;
};
export type Provenance = { boughtAt: string; previousOwners: number; original: ProvenanceOriginal };

export type ListingTrust = {
  sellerKind: "particular" | "store";
  sellerPageSlug: string | null;
  level: SellerLevel | null;
  provenance: Provenance | null;
  safeSpot: SafeSpotMark | null;
  meetup: { city: string; region: string };
};

export type StoreTrust = { level: SellerLevel | null; safeSpot: SafeSpotMark | null };

export type SellerPage = {
  userId: string;
  slug: string;
  firstName: string;
  city: string | null;
  memberSince: string;
  verifiedSales: number;
  activeListings: number;
  level: SellerLevel | null;
};

export type BuyerCard = {
  firstName: string;
  memberSince: string;
  verifiedPurchases: number;
  ratingCount: number;
  averageRating: number | null;
};
export type TrackRecord = BuyerCard & { enabled: boolean; token: string | null };

export type LevelFacts = {
  verifiedSales: number;
  reviewCount: number;
  averageRating: number | null;
  upheldReports: number;
  unansweredQuestions: number;
  storeActive: boolean;
};
export type MyLevels = {
  particular: { facts: LevelFacts; level: SellerLevel | null };
  store: { facts: LevelFacts; level: SellerLevel | null } | null;
};

export type MeetupSpot = {
  name: string;
  slug: string;
  district: string | null;
  city: string;
  address: string;
  openingHours: string | null;
  note: string | null;
};

export type SaleLine = { name: string; quantity: number };
export type CounterPurchaseStatus = "open" | "claimed" | "cancelled" | "expired" | "not_found";
export type CounterPurchase = {
  status: CounterPurchaseStatus;
  store: { name: string; slug: string; city: string | null; district: string | null; logoUrl: string | null; verified: boolean; active: boolean } | null;
  lines: SaleLine[];
  soldAt: string | null;
  expiresAt: string | null;
  mine: boolean;
  ownStore: boolean;
  transactionId: string | null;
};
export type CounterCode = { saleId: string; token: string; expiresAt: string };
export type CounterCodeStatus = { status: Exclude<CounterPurchaseStatus, "not_found">; buyerName: string | null; transactionId: string | null; expiresAt: string };

export type SafeSpotSettings = {
  storeId: string;
  storeSlug: string;
  missing: Array<"active" | "verified" | "address" | "show_address">;
  enabled: boolean;
  note: string | null;
  address: string | null;
  adminDisabled: boolean;
  adminDisabledReason: string | null;
};

export type ProvenanceOptions = {
  eligible: boolean;
  linked: { listingId: string; title: string; slug: string; status: string } | null;
  candidates: Array<{ listingId: string; title: string; status: string }>;
};

export type MyReviewPhoto = { id: string; status: "pending" | "approved" | "hidden" };

// ------------------------------------------------------------------ the mark (sell-08)

// The criteria the nightly job checks (laria_private.seller_level_meets), in the words of the "¿Por qué?" dialog.
export const LEVEL_MIN_SALES = 5;
export const LEVEL_MIN_REVIEWS = 3;
export const LEVEL_MIN_AVERAGE = 4.5;
export const LEVEL_REPORT_DAYS = 90;
export const LEVEL_ANSWER_DAYS = 7;

export function levelName(kind: SellerLevel["kind"]) {
  return kind === "store" ? "Tienda destacada" : "Vendedor destacado";
}

export const LEVEL_CRITERIA = [
  `${LEVEL_MIN_SALES} o más ventas confirmadas en Laria por quien vendió y quien compró.`,
  `Una nota promedio de ${formatAverage(LEVEL_MIN_AVERAGE)} o más, con al menos ${LEVEL_MIN_REVIEWS} reseñas.`,
  `Ningún reporte confirmado por Laria en los últimos ${LEVEL_REPORT_DAYS} días.`,
  `Responde las preguntas de sus publicaciones en menos de ${LEVEL_ANSWER_DAYS} días.`,
];

// For the seller's own card: each criterion, met or not, with their number.
export function levelProgress(facts: LevelFacts) {
  return [
    { label: "Ventas confirmadas", value: `${facts.verifiedSales} de ${LEVEL_MIN_SALES}`, met: facts.verifiedSales >= LEVEL_MIN_SALES },
    {
      label: "Reseñas y nota",
      value: facts.reviewCount === 0 || facts.averageRating === null
        ? `0 de ${LEVEL_MIN_REVIEWS} reseñas`
        : `${facts.reviewCount} ${facts.reviewCount === 1 ? "reseña" : "reseñas"}, ${formatAverage(facts.averageRating)} de 5`,
      met: facts.reviewCount >= LEVEL_MIN_REVIEWS && (facts.averageRating ?? 0) >= LEVEL_MIN_AVERAGE,
    },
    {
      label: `Reportes confirmados en ${LEVEL_REPORT_DAYS} días`,
      value: facts.upheldReports === 0 ? "Ninguno" : String(facts.upheldReports),
      met: facts.upheldReports === 0,
    },
    {
      label: `Preguntas sin responder por más de ${LEVEL_ANSWER_DAYS} días`,
      value: facts.unansweredQuestions === 0 ? "Ninguna" : String(facts.unansweredQuestions),
      met: facts.unansweredQuestions === 0,
    },
  ];
}

// ------------------------------------------------------------------ buyer track record (safe-07)

// The card's address and the WhatsApp line live in lib/contact-message.ts (buyerCardUrl, trackRecordLine).

// ------------------------------------------------------------------ provenance (safe-11)

// "Comprado en Laria en mayo de 2026 · 1 dueño anterior en Laria".
export function provenanceSummary(provenance: Pick<Provenance, "boughtAt" | "previousOwners">) {
  const owners = provenance.previousOwners === 1 ? "1 dueño anterior en Laria" : `${provenance.previousOwners} dueños anteriores en Laria`;
  const month = monthYearLong(provenance.boughtAt);
  return month ? `Comprado en Laria en ${month} · ${owners}` : owners;
}

// ------------------------------------------------------------------ safe meetups (safe-03)

// "Avisar a alguien" is built in lib/contact-message.ts (meetupNoticeMessage, meetupWhen, shareTextUrl).

// ------------------------------------------------------------------ counter purchases (reach-11)

export function counterPurchaseUrl(token: string) {
  return absoluteUrl(`/compra-en-tienda/${token}`);
}

export function saleLinesLabel(lines: SaleLine[]) {
  if (lines.length === 0) return "Compra en tienda";
  const [first, ...rest] = lines;
  const head = first.quantity > 1 ? `${first.name} (${first.quantity})` : first.name;
  return rest.length ? `${head} y ${rest.length} más` : head;
}

export function sellerPageUrl(slug: string) {
  return absoluteUrl(`/vendedores/${slug}`);
}

// ------------------------------------------------------------------ errors

const ERRORS: Array<[string, string]> = [
  ["COUNTER_AUTH_REQUIRED", "Ingresa a tu cuenta para confirmar la compra."],
  ["COUNTER_CODE_INVALID", "Este código no es válido. Pide a la tienda que lo muestre de nuevo."],
  ["COUNTER_CODE_USED", "Otra cuenta ya confirmó esta compra."],
  ["COUNTER_CODE_EXPIRED", "Este código venció. Se puede confirmar hasta 24 horas después de la compra."],
  ["COUNTER_SALE_UNDONE", "La tienda deshizo esta venta o cerró el código."],
  ["COUNTER_SALE_CLAIMED", "El cliente ya confirmó esta compra."],
  ["COUNTER_SALE_EXPIRED", "El código se puede mostrar hasta 24 horas después de la venta."],
  ["COUNTER_SALE_NOT_FOUND", "No encontramos esa venta. Regístrala en el mostrador y vuelve a intentarlo."],
  ["COUNTER_STORE_NOT_ACTIVE", "La tienda tiene que estar activa en Laria para usar el código."],
  ["COUNTER_OWN_STORE", "No puedes confirmar una compra en tu propia tienda."],
  ["COUNTER_STORE_DAILY_LIMIT", "Ya confirmaste una compra en esta tienda hoy. Puedes confirmar otra mañana."],
  ["COUNTER_DAILY_LIMIT", "Llegaste al límite de compras en tienda confirmadas por hoy."],
  ["COUNTER_CODE_LIMIT", "Llegaste al límite de códigos de hoy. Vuelve a intentarlo mañana."],
  ["REVIEW_PHOTO_LIMIT", "Puedes agregar hasta 3 fotos por reseña."],
  ["REVIEW_PHOTO_WINDOW_CLOSED", "Las fotos se agregan el mismo día de la reseña."],
  ["REVIEW_PHOTO_UPLOAD_MISSING", "Una foto no terminó de subir. Quítala y vuelve a agregarla."],
  ["REVIEW_PHOTO", "No pudimos guardar las fotos de tu reseña."],
  ["PROVENANCE_LISTING_TAKEN", "Esa publicación ya muestra el historial de otra compra."],
  ["PROVENANCE_ALREADY_RESOLD", "Ya vendiste este equipo con su historial, así que el vínculo se queda como está."],
  ["PROVENANCE", "No pudimos vincular esa publicación."],
  ["SAFE_SPOT_ADMIN_DISABLED", "Laria quitó tu tienda de los Puntos seguros. Escríbenos si crees que es un error."],
  ["SAFE_SPOT_NOT_ELIGIBLE", "Tu tienda todavía no cumple lo necesario para ser Punto seguro."],
  ["SAFE_SPOT_NOTE_INVALID", "La nota no puede tener teléfonos, correos ni enlaces, y llega hasta 200 caracteres."],
  ["SAFE_SPOT", "No pudimos guardar el cambio."],
  ["SELLER_PAGE", "No pudimos guardar el cambio."],
  ["TRACK_RECORD", "No pudimos guardar el cambio."],
];

export function trustErrorMessage(message: string | null | undefined) {
  const text = message ?? "";
  for (const [code, copy] of ERRORS) if (text.includes(code)) return copy;
  return "No pudimos completar la acción. Intenta nuevamente.";
}

// ------------------------------------------------------------------ parsers

export function readListingTrust(value: unknown): ListingTrust | null {
  if (!isRecord(value) || (value.seller_kind !== "particular" && value.seller_kind !== "store")) return null;
  const meetup = isRecord(value.meetup) ? value.meetup : {};
  return {
    sellerKind: value.seller_kind,
    sellerPageSlug: isRecord(value.seller_page) && isSlug(value.seller_page.slug) ? value.seller_page.slug : null,
    level: readLevel(value.level),
    provenance: readProvenance(value.provenance),
    safeSpot: readSafeSpot(value.safe_spot),
    meetup: { city: text(meetup.city) ?? "", region: text(meetup.region) ?? "" },
  };
}

export function readStoreTrust(value: unknown): StoreTrust | null {
  if (!isRecord(value)) return null;
  return { level: readLevel(value.level), safeSpot: readSafeSpot(value.safe_spot) };
}

export function readSellerPage(value: unknown): SellerPage | null {
  if (!isRecord(value) || !isText(value.user_id) || !isSlug(value.slug) || !isText(value.first_name) || !isDate(value.member_since)
    || !isCount(value.verified_sales) || !isCount(value.active_listings)) return null;
  return {
    userId: value.user_id,
    slug: value.slug,
    firstName: value.first_name,
    city: text(value.city),
    memberSince: value.member_since,
    verifiedSales: value.verified_sales,
    activeListings: value.active_listings,
    level: readLevel(value.level),
  };
}

// The seller's own settings card: null until they have a page (a Particular with an approved or sold publication).
export type MySellerPage = { slug: string; hidden: boolean };
export function readMySellerPage(value: unknown): MySellerPage | null {
  if (!isRecord(value) || value.exists !== true || !isSlug(value.slug)) return null;
  return { slug: value.slug, hidden: value.hidden === true };
}

export function readBuyerCard(value: unknown): BuyerCard | null {
  if (!isRecord(value) || !isText(value.first_name) || !isDate(value.member_since) || !isCount(value.verified_purchases)
    || !isCount(value.rating_count) || !(value.average_rating === null || isNumber(value.average_rating))) return null;
  return {
    firstName: value.first_name,
    memberSince: value.member_since,
    verifiedPurchases: value.verified_purchases,
    ratingCount: value.rating_count,
    averageRating: value.rating_count > 0 && isNumber(value.average_rating) ? value.average_rating : null,
  };
}

export function readTrackRecord(value: unknown): TrackRecord | null {
  const card = readBuyerCard(value);
  if (!card || !isRecord(value) || typeof value.enabled !== "boolean") return null;
  const token = typeof value.token === "string" && /^[0-9a-f]{24}$/.test(value.token) ? value.token : null;
  return { ...card, enabled: value.enabled && token !== null, token };
}

export function readLevelFacts(value: unknown): LevelFacts | null {
  if (!isRecord(value)) return null;
  return {
    verifiedSales: count(value.verified_sales),
    reviewCount: count(value.review_count),
    averageRating: isNumber(value.average_rating) ? value.average_rating : null,
    upheldReports: count(value.upheld_reports_90d),
    unansweredQuestions: count(value.unanswered_questions),
    storeActive: value.store_active === true,
  };
}

export function readMyLevels(value: unknown): MyLevels | null {
  if (!isRecord(value) || !isRecord(value.particular)) return null;
  const particular = readLevelFacts(value.particular.facts);
  if (!particular) return null;
  const store = isRecord(value.store) ? readLevelFacts(value.store.facts) : null;
  return {
    particular: { facts: particular, level: readLevel(value.particular.level) },
    store: store && isRecord(value.store) ? { facts: store, level: readLevel(value.store.level) } : null,
  };
}

export function readMeetupSpots(value: unknown): MeetupSpot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MeetupSpot[] => {
    if (!isRecord(item) || !isText(item.name) || !isSlug(item.slug) || !isText(item.city) || !isText(item.address)) return [];
    return [{
      name: item.name,
      slug: item.slug,
      district: text(item.district),
      city: item.city,
      address: item.address,
      openingHours: text(item.opening_hours),
      note: text(item.note),
    }];
  });
}

const COUNTER_STATUSES = new Set<CounterPurchaseStatus>(["open", "claimed", "cancelled", "expired", "not_found"]);

export function readCounterPurchase(value: unknown): CounterPurchase {
  const empty: CounterPurchase = { status: "not_found", store: null, lines: [], soldAt: null, expiresAt: null, mine: false, ownStore: false, transactionId: null };
  if (!isRecord(value) || !COUNTER_STATUSES.has(value.status as CounterPurchaseStatus) || value.status === "not_found") return empty;
  const store = isRecord(value.store) && isText(value.store.name) && isSlug(value.store.slug) ? {
    name: value.store.name,
    slug: value.store.slug,
    city: text(value.store.city),
    district: text(value.store.district),
    logoUrl: text(value.store.logo_url),
    verified: value.store.is_verified === true,
    active: value.store.active === true,
  } : null;
  if (!store) return empty;
  return {
    status: value.status as CounterPurchaseStatus,
    store,
    lines: readLines(value.lines),
    soldAt: isDate(value.sold_at) ? value.sold_at : null,
    expiresAt: isDate(value.expires_at) ? value.expires_at : null,
    mine: value.mine === true,
    ownStore: value.own_store === true,
    transactionId: isText(value.transaction_id) ? value.transaction_id : null,
  };
}

export function readCounterCode(value: unknown): CounterCode | null {
  if (!isRecord(value) || !isText(value.sale_id) || typeof value.token !== "string" || !/^[0-9a-f]{32}$/.test(value.token) || !isDate(value.expires_at)) return null;
  return { saleId: value.sale_id, token: value.token, expiresAt: value.expires_at };
}

export function readCounterCodeStatus(value: unknown): CounterCodeStatus | null {
  if (!isRecord(value) || !COUNTER_STATUSES.has(value.status as CounterPurchaseStatus) || value.status === "not_found" || !isDate(value.expires_at)) return null;
  return {
    status: value.status as CounterCodeStatus["status"],
    buyerName: text(value.buyer_name),
    transactionId: isText(value.transaction_id) ? value.transaction_id : null,
    expiresAt: value.expires_at,
  };
}

const MISSING = new Set(["active", "verified", "address", "show_address"]);

export function readSafeSpotSettings(value: unknown): SafeSpotSettings | null {
  if (!isRecord(value) || !isText(value.store_id) || !isSlug(value.store_slug) || !Array.isArray(value.missing)) return null;
  return {
    storeId: value.store_id,
    storeSlug: value.store_slug,
    missing: value.missing.filter((item): item is SafeSpotSettings["missing"][number] => typeof item === "string" && MISSING.has(item)),
    enabled: value.enabled === true,
    note: text(value.note),
    address: text(value.address),
    adminDisabled: value.admin_disabled === true,
    adminDisabledReason: text(value.admin_disabled_reason),
  };
}

export function readProvenanceOptions(value: unknown): ProvenanceOptions {
  if (!isRecord(value) || value.eligible !== true) return { eligible: false, linked: null, candidates: [] };
  const linked = isRecord(value.linked) && isText(value.linked.listing_id) && isText(value.linked.title) && isSlug(value.linked.slug)
    ? { listingId: value.linked.listing_id, title: value.linked.title, slug: value.linked.slug, status: text(value.linked.status) ?? "" }
    : null;
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.flatMap((item) => isRecord(item) && isText(item.listing_id) && isText(item.title)
      ? [{ listingId: item.listing_id, title: item.title, status: text(item.status) ?? "" }]
      : [])
    : [];
  return { eligible: true, linked, candidates };
}

export function readReviewPhotos(value: unknown): ReviewPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isRecord(item) && isUuid(item.id) ? [{ id: item.id }] : []).slice(0, 3);
}

export function readMyReviewPhotos(value: unknown): MyReviewPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MyReviewPhoto[] => isRecord(item) && isUuid(item.id)
    && (item.status === "pending" || item.status === "approved" || item.status === "hidden")
    ? [{ id: item.id, status: item.status }]
    : []);
}

export function readLines(value: unknown): SaleLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isRecord(item) && isText(item.name) && Number.isInteger(item.quantity) && Number(item.quantity) > 0
    ? [{ name: item.name, quantity: Number(item.quantity) }]
    : []);
}

function readLevel(value: unknown): SellerLevel | null {
  if (!isRecord(value) || (value.kind !== "particular" && value.kind !== "store") || !isDate(value.since)) return null;
  return { kind: value.kind, since: value.since };
}

function readSafeSpot(value: unknown): SafeSpotMark | null {
  if (!isRecord(value)) return null;
  return { note: text(value.note), since: isDate(value.since) ? value.since : null };
}

function readProvenance(value: unknown): Provenance | null {
  if (!isRecord(value) || !isDate(value.bought_at) || !Number.isInteger(value.previous_owners) || Number(value.previous_owners) < 1
    || !isRecord(value.original)) return null;
  const original = value.original;
  return {
    boughtAt: value.bought_at,
    previousOwners: Number(value.previous_owners),
    original: {
      category: text(original.category),
      instrumentType: text(original.instrument_type),
      brand: text(original.brand),
      model: text(original.model),
      condition: text(original.condition),
      attributes: isRecord(original.attributes) ? original.attributes : {},
      publishedAt: isDate(original.published_at) ? original.published_at : null,
    },
  };
}

// ------------------------------------------------------------------ formatting

const LIMA = "America/Lima";

// "mayo de 2026".
export function monthYearLong(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: LIMA }).format(date);
}

export function formatAverage(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function text(value: unknown) {
  return isText(value) ? value.trim() : null;
}
function isSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
function count(value: unknown) {
  return isCount(value) ? value : 0;
}
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
