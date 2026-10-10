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

// "Publicado hace 3 días" from the publication date (or the creation date before publication existed).
export function formatPublishedAgo(value: string, now: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Publicado recientemente";
  const days = Math.max(0, Math.floor((now - date.getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Publicado hoy";
  return `Publicado hace ${days} ${days === 1 ? "día" : "días"}`;
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
