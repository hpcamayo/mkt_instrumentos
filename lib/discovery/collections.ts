import { filtersFromQuery } from "@/lib/discovery/gift-finder";
import type { ListingFilters } from "@/lib/listings";

// disc-03 "Colecciones" (docs/feature-ideas/discovery.md): Admin saves a title, a short text, dates and up to four
// catalog filter sets; the home and /colecciones show the ones inside their dates. Pure, so the pages, the Admin form
// and the tests share it.

export const COLLECTIONS_PATH = "/colecciones";
export const MAX_COLLECTION_SETS = 4;

export type CollectionSet = { label: string; query: string };

export type Collection = {
  id: string;
  slug: string;
  title: string;
  intro: string;
  sets: CollectionSet[];
  starts_on: string | null;
  ends_on: string | null;
  published: boolean;
  sort_order: number;
};

export function collectionPath(slug: string) {
  return `${COLLECTIONS_PATH}/${slug}`;
}

const QUERY_CHARACTERS = /^[A-Za-z0-9_=&%+.,-]+$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isSet(value: unknown): value is CollectionSet {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.label === "string" && typeof item.query === "string";
}

// A row as the database returns it, or null when it is not a collection.
export function parseCollection(value: unknown): Collection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.title !== "string" || typeof row.intro !== "string") return null;
  const sets = Array.isArray(row.sets) ? row.sets.filter(isSet).map((set) => ({ label: set.label, query: set.query })) : [];
  if (sets.length === 0) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    intro: row.intro,
    sets,
    starts_on: typeof row.starts_on === "string" ? row.starts_on : null,
    ends_on: typeof row.ends_on === "string" ? row.ends_on : null,
    published: row.published === true,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 100,
  };
}

export function parseCollections(value: unknown): Collection[] {
  return (Array.isArray(value) ? value : []).map(parseCollection).filter((item): item is Collection => item !== null);
}

// A set's filters, exactly as /listados reads the same query (its "Ver todo" link opens the same results).
export function collectionSetFilters(set: CollectionSet): ListingFilters {
  return filtersFromQuery(set.query);
}

// "Ver todo" for a set: the catalog with the set's own parameters.
export function collectionSetHref(set: CollectionSet) {
  return `/listados?${set.query}`;
}

// A catalog link pasted into the Admin form ("https://laria.pe/listados?category=guitars&max_price=500" or the bare
// query) becomes the set's query. Null when it has nothing usable.
export function querySetFromInput(raw: string) {
  const text = raw.trim();
  if (!text) return null;
  const query = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text.replace(/^\/?listados\/?/, "");
  const clean = query.split("#")[0].replace(/^&+|&+$/g, "");
  if (clean.length < 3 || clean.length > 300) return null;
  // Re-encode through URLSearchParams, so spaces and accents ("q=bombo andino") fit the stored character set.
  const encoded = new URLSearchParams(clean).toString();
  return QUERY_CHARACTERS.test(encoded) && encoded.length <= 300 ? encoded : null;
}

export type CollectionDraft = {
  id: string | null;
  slug: string;
  title: string;
  intro: string;
  sets: CollectionSet[];
  starts_on: string | null;
  ends_on: string | null;
  published: boolean;
  sort_order: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The Admin form's checks, the same as the database's (admin_save_collection), so mistakes show beside the field.
export function collectionDraftErrors(draft: CollectionDraft) {
  const errors: Partial<Record<"slug" | "title" | "intro" | "sets" | "dates", string>> = {};
  if (!SLUG.test(draft.slug) || draft.slug.length > 60) errors.slug = "Usa minúsculas, números y guiones (hasta 60).";
  if (draft.title.trim().length < 3 || draft.title.trim().length > 80) errors.title = "Escribe un título de 3 a 80 caracteres.";
  if (draft.intro.trim().length < 20 || draft.intro.trim().length > 400) errors.intro = "Escribe un texto de 20 a 400 caracteres.";
  if (
    draft.sets.length < 1 || draft.sets.length > MAX_COLLECTION_SETS
    || draft.sets.some((set) => set.label.trim().length < 2 || set.label.trim().length > 40 || set.query.length < 3 || set.query.length > 300 || !QUERY_CHARACTERS.test(set.query))
  ) {
    errors.sets = "Agrega de 1 a 4 grupos, cada uno con un nombre (2 a 40 caracteres) y un enlace del catálogo.";
  }
  if ((draft.starts_on && !DATE.test(draft.starts_on)) || (draft.ends_on && !DATE.test(draft.ends_on))) errors.dates = "Revisa las fechas.";
  else if (draft.starts_on && draft.ends_on && draft.ends_on < draft.starts_on) errors.dates = "La fecha de fin va después de la de inicio.";
  return errors;
}

// Where a collection stands today (Lima's date, "YYYY-MM-DD"), for Admin.
export function collectionState(collection: Pick<Collection, "published" | "starts_on" | "ends_on">, today: string) {
  if (!collection.published) return "draft" as const;
  if (collection.starts_on && collection.starts_on > today) return "scheduled" as const;
  if (collection.ends_on && collection.ends_on < today) return "ended" as const;
  return "live" as const;
}

export const COLLECTION_STATE_LABELS = {
  draft: "Borrador",
  scheduled: "Programada",
  ended: "Terminó",
  live: "Visible",
} as const;

export function limaToday(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
