// Pure helpers for the listing and store pages (docs/ux-redesign/ux-4-listing-store.md). Server and client code and
// the tests share them, so every figure and date reads the same everywhere.

const LIMA = "America/Lima";

// "set. 2026", "jul. 2026": the month and year in Lima (reviews, "En Laria desde").
export function formatMonthYear(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric", timeZone: LIMA }).format(date);
}

// "4.8": one decimal, the way the figures and the reviews print an average.
export function formatRating(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function reviewCountLabel(count: number) {
  return `${count} ${count === 1 ? "reseña" : "reseñas"}`;
}

export function listingCountLabel(count: number) {
  return `${count} ${count === 1 ? "publicación" : "publicaciones"}`;
}

// The reviewer's name on public reviews (UX-4 L11 B): the first name and the initial of the next word ("Rodrigo C.").
// A missing name reads "Comprador de Laria", as before.
export function reviewerDisplayName(fullName: string | null | undefined) {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Comprador de Laria";
  const [first, next] = words;
  const initial = next ? [...next][0]?.toLocaleUpperCase("es-PE") : undefined;
  return initial ? `${first} ${initial}.` : first;
}

const DAY = 24 * 60 * 60 * 1000;

// "hace 3 días", "hace 2 semanas", "hace 5 meses", "hace 1 año" (list-04): how people say it, never "hace 400 días".
export function timeAgo(value: string | null | undefined, now: number) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.max(0, Math.floor((now - date.getTime()) / DAY));
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.floor(days / 7)} semanas`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
  }
  const years = Math.floor(days / 365);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

// "Publicado hace 3 días" from the publication date (or the creation date before publication existed).
export function formatPublishedAgo(value: string, now: number) {
  const ago = timeAgo(value, now);
  if (ago === null) return "Publicado recientemente";
  return `Publicado ${ago}`;
}

// "Actualizado hace 3 días" (list-04): only when the seller changed what a buyer reads (price, text, details) at least a
// day after publishing. listings.content_changed_at is kept by the database; view counts never move it.
export function formatUpdatedAgo(changedAt: string | null | undefined, publishedAt: string | null | undefined, now: number) {
  if (!changedAt) return null;
  const changed = Date.parse(changedAt);
  const published = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (Number.isNaN(changed) || (!Number.isNaN(published) && changed - published < DAY)) return null;
  const ago = timeAgo(changedAt, now);
  return ago ? `Actualizado ${ago}` : null;
}

// A listing published more than 90 days ago and untouched for 60 gets a gentle "consulta si sigue disponible" (list-04).
export function isQuietListing(publishedAt: string | null | undefined, changedAt: string | null | undefined, now: number) {
  const published = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (Number.isNaN(published) || now - published < 90 * DAY) return false;
  const changed = changedAt ? Date.parse(changedAt) : Number.NaN;
  return Number.isNaN(changed) || now - changed >= 60 * DAY;
}

// "Antes S/ 2,500" (list-05): the database records a drop only when it is real (approved, at least 5%, from a price
// that had been in effect a week). The page shows it for 30 days after the drop, never on a sold listing.
export const PRICE_DROP_DAYS = 30;
export function visiblePreviousPrice(
  listing: { price_pen: number | null; previous_price_pen?: number | null; price_dropped_at?: string | null; status?: string },
  now: number,
) {
  if (listing.status === "sold" || listing.price_pen === null || !listing.previous_price_pen || !listing.price_dropped_at) return null;
  const dropped = Date.parse(listing.price_dropped_at);
  if (Number.isNaN(dropped) || now - dropped > PRICE_DROP_DAYS * DAY) return null;
  return listing.previous_price_pen > listing.price_pen ? listing.previous_price_pen : null;
}

// "Activo hoy / esta semana / este mes" (list-10), from the coarse bucket the database returns. Older or unknown: none.
export function lastActiveLabel(value: unknown) {
  return value === "today" ? "Activo hoy" : value === "week" ? "Activo esta semana" : value === "month" ? "Activo este mes" : null;
}

// Under this many reviews the seller card leads with the other verified facts (list-10).
export const FEW_REVIEWS = 10;

export function verifiedSalesLabel(count: number) {
  return count === 1 ? "1 venta confirmada en Laria" : `${count} ventas confirmadas en Laria`;
}

// Social links on the store page (UX-4 L18 A): only http(s) URLs are links; anything else is left out.
export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// The seller's public facts (list-10, trust-03), from get_public_seller_facts. Anything malformed is left out.
export type StoreChecks = {
  ruc: string | null;
  razonSocial: string | null;
  // The street only when the store shows it on its page (list-12); addressChecked says Laria checked one either way.
  address: string | null;
  addressChecked: boolean;
  district: string | null;
  city: string | null;
  phoneOnFile: boolean;
  verifiedSince: string | null;
};
export type SellerFacts = {
  memberSince: string | null;
  lastActive: string | null;
  verifiedSales: number;
  emailConfirmed: boolean;
  store: StoreChecks | null;
};

export function readSellerFacts(value: unknown): SellerFacts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const text = (input: unknown) => (typeof input === "string" && input.trim() ? input : null);
  const store = record.store && typeof record.store === "object" && !Array.isArray(record.store) ? (record.store as Record<string, unknown>) : null;
  const sales = Number(record.verified_sales);
  return {
    memberSince: text(record.member_since),
    lastActive: text(record.last_active),
    verifiedSales: Number.isInteger(sales) && sales > 0 ? sales : 0,
    emailConfirmed: record.email_confirmed === true,
    store: store
      ? {
          ruc: text(store.ruc),
          razonSocial: text(store.razon_social),
          address: text(store.address),
          addressChecked: store.address_checked === true || text(store.address) !== null,
          district: text(store.district),
          city: text(store.city),
          phoneOnFile: store.phone_on_file === true,
          verifiedSince: text(store.verified_since),
        }
      : null,
  };
}

// "Nuevo en Laria" said plainly (list-10): an account or store younger than 60 days.
export function isNewMember(memberSince: string | null | undefined, now: number) {
  const since = memberSince ? Date.parse(memberSince) : Number.NaN;
  return !Number.isNaN(since) && now - since < 60 * DAY;
}

// list-06: the review page (get_public_review_page): the total, the count per star and one page of reviews.
export type ReviewItem = { id: string; rating: number; comment: string | null; submitted_at: string; reviewer_name: string | null };
export type ReviewPage = { reviewCount: number; breakdown: Record<1 | 2 | 3 | 4 | 5, number>; items: ReviewItem[] };

export function readReviewPage(value: unknown): ReviewPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const count = Number(record.review_count);
  const raw = record.breakdown && typeof record.breakdown === "object" ? (record.breakdown as Record<string, unknown>) : null;
  if (!Number.isInteger(count) || count < 0 || !raw || !Array.isArray(record.items)) return null;
  const star = (key: string) => {
    const n = Number(raw[key]);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  };
  const items = record.items.filter((item): item is ReviewItem => {
    if (!item || typeof item !== "object") return false;
    const review = item as Record<string, unknown>;
    return typeof review.id === "string" && Number.isInteger(review.rating) && Number(review.rating) >= 1 && Number(review.rating) <= 5
      && typeof review.submitted_at === "string" && (review.comment === null || typeof review.comment === "string")
      && (review.reviewer_name === null || typeof review.reviewer_name === "string");
  });
  return { reviewCount: count, breakdown: { 5: star("5"), 4: star("4"), 3: star("3"), 2: star("2"), 1: star("1") }, items };
}

export const REVIEW_PAGE_SIZE = 20;

// "Publicaciones similares" (list-07), without the catalog: the same brand first, then a price within 30%, then the same
// city; newer first among equals. Brand and city compare without case or accents.
type SimilarCandidate = { id: string; brand: string | null; price_pen: number | null; city: string; published_at: string | null; created_at: string };

function fold(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("es-PE");
}

export function similarScore(candidate: SimilarCandidate, source: SimilarCandidate) {
  let score = 0;
  if (fold(source.brand) && fold(candidate.brand) === fold(source.brand)) score += 4;
  if (source.price_pen && candidate.price_pen && Math.abs(candidate.price_pen - source.price_pen) <= source.price_pen * 0.3) score += 2;
  if (fold(source.city) && fold(candidate.city) === fold(source.city)) score += 1;
  return score;
}

export function rankSimilarListings<T extends SimilarCandidate>(candidates: T[], source: SimilarCandidate, max = 8): T[] {
  const time = (item: SimilarCandidate) => {
    const value = Date.parse(item.published_at ?? item.created_at);
    return Number.isNaN(value) ? 0 : value;
  };
  const seen = new Set<string>([source.id]);
  return candidates
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .map((item) => ({ item, score: similarScore(item, source), at: time(item) }))
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, max)
    .map(({ item }) => item);
}

// list-03: up to five key specs in one line under the title ("Overdrive · Compacto · Incluye fuente"). A yes/no
// attribute reads as its label when yes ("Incluye fuente") and is left out when no; others read as their value.
export function keySpecLine(specs: { label: string; value: string }[], max = 5) {
  const values = specs
    .map((spec) => {
      const value = spec.value.trim();
      if (/^s[ií]$/i.test(value)) return spec.label.trim();
      if (/^no$/i.test(value)) return "";
      return value;
    })
    .filter(Boolean)
    .slice(0, max);
  return values.length ? values.join(" · ") : null;
}
