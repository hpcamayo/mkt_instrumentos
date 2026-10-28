// Mis publicaciones (mine-04, mine-06, mine-07, mine-10, mine-12, mine-13; docs/ux-effortless/my-listings.md):
// the status tabs, search, sort and pages of the owner's list, the actions each row offers, and the copy of the undo
// notice. Pure functions, shared by app/mi-cuenta/publicaciones and components/listing-management-table.tsx, so the
// page, the table and the tests agree.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

export type ManagedListing = {
  id: string;
  title: string;
  status: string;
  slug: string;
  price_pen: number | null;
  created_at: string;
  published_at?: string | null;
  sold_at?: string | null;
  analytics?: { views: number; contacts: number; favorites: number };
  rejection_reason: string | null;
  hidden_source: string | null;
  hidden_reason: string | null;
  revisionStatus: "pending" | "rejected" | null;
  revisionReason: string | null;
  // Store listings only: the inventory SKU that controls this listing's stock (design §5.3, D-15).
  inventoryItemId?: string | null;
  // The first photo by position. `undefined` when the page did not load photos (no thumbnail column content).
  photoUrl?: string | null;
  // mine-12 vacation mode: the date the listing returns (YYYY-MM-DD, America/Lima).
  paused_until?: string | null;
  // talk-06 "Reservado" (Particular listings): the period, running or ended and waiting for "¿Se vendió?".
  reservation?: { until: string; ended: boolean; watchers: number } | null;
};

// ------------------------------------------------------------------ tabs, search, sort, pages

export type MyListingsView = "todas" | "accion" | "activas" | "revision" | "ocultas" | "borradores" | "vendidas";
export type MyListingsSort = "recientes" | "vistas" | "contactos" | "precio";
export type MyListingsQuery = { vista: MyListingsView; q: string; orden: MyListingsSort; pagina: number };

export const MY_LISTINGS_VIEWS: { key: MyListingsView; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "accion", label: "Requieren acción" },
  { key: "activas", label: "Activas" },
  { key: "revision", label: "En revisión" },
  { key: "ocultas", label: "Ocultas" },
  { key: "borradores", label: "Borradores" },
  { key: "vendidas", label: "Vendidas" },
];

export const MY_LISTINGS_SORTS: { key: MyListingsSort; label: string }[] = [
  { key: "recientes", label: "Más recientes" },
  { key: "vistas", label: "Más vistas" },
  { key: "contactos", label: "Más contactos" },
  { key: "precio", label: "Precio: menor a mayor" },
];

export const MY_LISTINGS_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 80;

export const DEFAULT_MY_LISTINGS_QUERY: MyListingsQuery = { vista: "todas", q: "", orden: "recientes", pagina: 1 };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Unknown or malformed values fall back to the defaults; the URL never breaks the page.
export function parseMyListingsQuery(params: Record<string, string | string[] | undefined>): MyListingsQuery {
  const vista = first(params.vista);
  const orden = first(params.orden);
  const pagina = first(params.pagina);
  const page = pagina && /^[1-9][0-9]{0,4}$/.test(pagina) ? Number(pagina) : 1;
  return {
    vista: MY_LISTINGS_VIEWS.some((view) => view.key === vista) ? (vista as MyListingsView) : "todas",
    q: (first(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH),
    orden: MY_LISTINGS_SORTS.some((sort) => sort.key === orden) ? (orden as MyListingsSort) : "recientes",
    pagina: page,
  };
}

// The list's URL with only the values that differ from the defaults. Changing the tab, the search or the order
// starts again on page 1 unless a page is given.
export function myListingsHref(base: string, query: Partial<MyListingsQuery>) {
  const params = new URLSearchParams();
  if (query.vista && query.vista !== "todas") params.set("vista", query.vista);
  if (query.q) params.set("q", query.q);
  if (query.orden && query.orden !== "recientes") params.set("orden", query.orden);
  if (query.pagina && query.pagina > 1) params.set("pagina", String(query.pagina));
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

type Classifiable = Pick<ManagedListing, "status" | "hidden_source" | "revisionStatus">;

// The tabs a listing belongs to. A published listing with changes in review is both Activa and En revisión; one whose
// last changes were rejected is both Activa and Requiere acción.
export function listingViews(listing: Classifiable): MyListingsView[] {
  const views: MyListingsView[] = ["todas"];
  const adminHidden = listing.status === "hidden" && listing.hidden_source === "admin";
  if (listing.status === "rejected" || adminHidden || listing.revisionStatus === "rejected") views.push("accion");
  if (listing.status === "approved") views.push("activas");
  if (listing.status === "pending" || listing.revisionStatus === "pending") views.push("revision");
  if (listing.status === "hidden" && listing.hidden_source === "owner") views.push("ocultas");
  if (listing.status === "draft") views.push("borradores");
  if (listing.status === "sold" || listing.status === "archived") views.push("vendidas");
  return views;
}

export function countListingViews(listings: Classifiable[]): Record<MyListingsView, number> {
  const counts = Object.fromEntries(MY_LISTINGS_VIEWS.map((view) => [view.key, 0])) as Record<MyListingsView, number>;
  for (const listing of listings) for (const view of listingViews(listing)) counts[view] += 1;
  return counts;
}

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Every word of the search must appear in the title, ignoring case and tildes.
export function matchesTitle(title: string, q: string) {
  const words = fold(q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(title);
  return words.every((word) => haystack.includes(word));
}

type Sortable = Pick<ManagedListing, "created_at" | "price_pen" | "analytics">;

// Ties (and missing metrics or prices, which go last) keep the newest first.
export function sortListings<T extends Sortable>(listings: T[], orden: MyListingsSort): T[] {
  const newest = (a: T, b: T) => (b.created_at ?? "").localeCompare(a.created_at ?? "");
  const metric = (key: "views" | "contacts") => (a: T, b: T) =>
    (b.analytics?.[key] ?? -1) - (a.analytics?.[key] ?? -1) || newest(a, b);
  const compare =
    orden === "vistas" ? metric("views")
      : orden === "contactos" ? metric("contacts")
        : orden === "precio" ? (a: T, b: T) => (a.price_pen ?? Number.POSITIVE_INFINITY) - (b.price_pen ?? Number.POSITIVE_INFINITY) || newest(a, b)
          : newest;
  return [...listings].sort(compare);
}

export type MyListingsPage<T> = {
  items: T[];
  counts: Record<MyListingsView, number>;
  total: number;
  page: number;
  pageCount: number;
  from: number;
  to: number;
};

// The search narrows every tab (the counts are what each tab will show); then the tab, the order and the page.
export function selectMyListingsPage<T extends Classifiable & Sortable & { title: string }>(
  listings: T[],
  query: MyListingsQuery,
  pageSize = MY_LISTINGS_PAGE_SIZE,
): MyListingsPage<T> {
  const searched = listings.filter((listing) => matchesTitle(listing.title, query.q));
  const counts = countListingViews(searched);
  const inView = searched.filter((listing) => listingViews(listing).includes(query.vista));
  const sorted = sortListings(inView, query.orden);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(query.pagina, pageCount);
  const start = (page - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);
  return { items, counts, total: sorted.length, page, pageCount, from: items.length ? start + 1 : 0, to: start + items.length };
}

// ------------------------------------------------------------------ loading helpers

type RevisionRow = { listing_id: string; status: string | null; rejection_reason: string | null };

// The most recent revision that is pending or rejected, per listing (rows come newest first).
export function latestRevisionByListing(revisions: RevisionRow[]) {
  const byListing = new Map<string, { status: "pending" | "rejected"; reason: string | null }>();
  for (const revision of revisions) {
    if (!byListing.has(revision.listing_id) && (revision.status === "pending" || revision.status === "rejected")) {
      byListing.set(revision.listing_id, { status: revision.status, reason: revision.rejection_reason });
    }
  }
  return byListing;
}

// Revisions of the owner's listings, in chunks so a long list never builds an overlong request.
export async function loadRevisionStates(supabase: SupabaseClient<Database>, listingIds: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < listingIds.length; index += 100) chunks.push(listingIds.slice(index, index + 100));
  const results = await Promise.all(chunks.map((ids) => supabase
    .from("listing_revisions")
    .select("listing_id,status,rejection_reason,submitted_at")
    .in("listing_id", ids)
    .order("submitted_at", { ascending: false })));
  const rows = results.flatMap((result) => result.data ?? []);
  rows.sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
  return latestRevisionByListing(rows);
}

export function firstPhotoUrl(photos: { image_url: string; sort_order: number }[] | null | undefined) {
  if (!photos?.length) return null;
  return [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].image_url;
}

// Private photos (edit and import uploads) are served by the app with the owner's session, never by the optimizer.
export function isPrivatePhoto(url: string) {
  return url.startsWith("/api/listing-images/");
}

// ------------------------------------------------------------------ mine-12 vacation mode

function limaToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Paused while the return date is after today in Lima (listing_is_paused in the database).
export function isPaused(pausedUntil: string | null | undefined, now = new Date()) {
  return Boolean(pausedUntil && /^\d{4}-\d{2}-\d{2}$/.test(pausedUntil) && pausedUntil > limaToday(now));
}

const pauseDates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function pausedLabel(pausedUntil: string | null | undefined, now = new Date()) {
  if (!isPaused(pausedUntil, now)) return null;
  return `Pausada hasta el ${pauseDates.format(new Date(`${pausedUntil}T12:00:00Z`))}`;
}

// ------------------------------------------------------------------ row actions

export type RowActions = {
  isAdminHidden: boolean;
  stockManaged: boolean;
  open: boolean;
  edit: boolean;
  preview: boolean;
  hide: boolean;
  restore: boolean;
  // "Marcar vendida" (published) and "Ya lo vendí" (hidden by the owner): action `sold`, with a confirmation.
  markSold: boolean;
  soldFromHidden: boolean;
  // "Lo vendí, retirar": action `withdraw_sold`, with a confirmation; the listing goes to Vendidas.
  withdrawSold: boolean;
  resubmit: boolean;
  relist: boolean;
  duplicate: boolean;
  price: boolean;
  select: boolean;
  attribute: boolean;
  controlStock: boolean;
  // talk-06: "Reservar" a Particular's published listing, or change, end or answer its period.
  reserve: boolean;
};

// A listing whose stock Inventario controls is sold and priced from Inventario (D-15): no sale or price actions here.
export function rowActions(listing: Pick<ManagedListing, "status" | "hidden_source" | "inventoryItemId">, { canControlStock = false, canReserve = false } = {}): RowActions {
  const { status } = listing;
  const isAdminHidden = status === "hidden" && listing.hidden_source === "admin";
  const ownerHidden = status === "hidden" && listing.hidden_source === "owner";
  const stockManaged = Boolean(listing.inventoryItemId);
  const closed = status === "sold" || status === "archived";
  const edit = !closed && !isAdminHidden;
  return {
    isAdminHidden,
    stockManaged,
    open: status === "approved" || status === "sold",
    edit,
    preview: status === "draft" || status === "pending" || status === "rejected",
    hide: status === "approved",
    restore: ownerHidden,
    markSold: status === "approved" && !stockManaged,
    soldFromHidden: ownerHidden && !stockManaged,
    withdrawSold: (status === "pending" || status === "draft" || status === "rejected") && !stockManaged,
    resubmit: status === "rejected",
    relist: status === "sold",
    // Sold listings offer "Republicar" instead, which keeps the link to the sale.
    duplicate: edit,
    price: (status === "approved" || status === "pending") && !stockManaged,
    select: status === "approved" || ownerHidden,
    attribute: status === "sold",
    controlStock: !stockManaged && canControlStock && edit,
    reserve: canReserve && status === "approved" && !stockManaged,
  };
}

// ------------------------------------------------------------------ mine-13 undo notices

export type UndoableAction = "hide" | "restore";

export const INVERSE_ACTION: Record<UndoableAction, UndoableAction> = { hide: "restore", restore: "hide" };

export const UNDO_MESSAGES = {
  hide: "Publicación ocultada.",
  restore: "Publicación restaurada.",
  price: "Precio actualizado.",
  undone: "Cambio deshecho.",
} as const;

export function bulkResultMessage(action: UndoableAction, changed: number, failed: number) {
  if (!failed) {
    const verb = action === "hide" ? (changed === 1 ? "ocultada" : "ocultadas") : (changed === 1 ? "restaurada" : "restauradas");
    return `${changed} ${changed === 1 ? "publicación" : "publicaciones"} ${verb}.`;
  }
  return `${changed} ${changed === 1 ? "cambiada" : "cambiadas"}, ${failed} no se ${failed === 1 ? "pudo" : "pudieron"} cambiar.`;
}

// set_owned_listings_lifecycle_bulk returns { changed: uuid[], failed: { id, code }[] }.
export function parseBulkResult(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const changed = Array.isArray(record.changed) ? record.changed.filter((id): id is string => typeof id === "string") : [];
  const failed = Array.isArray(record.failed) ? record.failed.length : 0;
  return { changed, failed };
}
