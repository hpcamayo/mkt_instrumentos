import type { SupabaseClient } from "@supabase/supabase-js";

// Store inventory (docs/store-operations/design.md §3–§5, §13). The database functions are the only writers; this file
// holds the read helpers, the labels and the shared shapes used by the Inventario screens and the API routes.

export type InventoryListing = {
  id: string;
  slug: string;
  title: string;
  status: string;
  stock_state: string | null;
  category: string | null;
  price_pen: number | null;
  has_pending_revision: boolean;
};

export type StockLevel = "in_stock" | "low" | "out";

export type InventoryItem = {
  id: string;
  store_id: string;
  merchant_sku: string;
  sku_generated: boolean;
  product_name: string;
  variant_label: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  low_stock_threshold: number | null;
  unit_price_pen: number | null;
  inventory_status: "active" | "archived";
  stock_source: string;
  external_reference: string | null;
  catalog_product_id: string | null;
  catalog_variant_id: string | null;
  listing_id: string | null;
  // The SKU's own category (set by imports); Inventario shows the publication's category first when there is one.
  category: string | null;
  version: number;
  last_movement_at: string | null;
  created_at: string;
  updated_at: string;
  stock_level: StockLevel;
  listing: InventoryListing | null;
};

export type RecentMovement = {
  id: string;
  item_id: string;
  merchant_sku: string;
  product_name: string;
  movement_type: string;
  channel: string;
  on_hand_delta: number;
  on_hand_after: number;
  actor_kind: string;
  created_at: string;
};

export type InventorySummary = {
  inventory_enabled: boolean;
  can_write: boolean;
  store_status: string;
  skus: number;
  archived: number;
  units: number;
  available_units: number;
  low_stock: number;
  out_of_stock: number;
  unlinked: number;
  published: number;
  hidden: number;
  in_review: number;
  rejected: number;
  sales_30d_units: number;
  sales_30d_count: number;
  recent_movements: RecentMovement[];
};

export type StockMovement = {
  id: string;
  item_id: string;
  movement_type: string;
  channel: string;
  on_hand_delta: number;
  on_hand_before: number;
  on_hand_after: number;
  actor_kind: string;
  reference: string | null;
  reason: string | null;
  import_session_id: string | null;
  import_row_number: number | null;
  created_at: string;
};

export type InventoryChange = {
  id: string;
  change_type: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  actor_kind: string;
  reason: string | null;
  created_at: string;
};

// ------------------------------------------------------------------ filters (get_inventory_page)

export type InventoryFilters = {
  q: string;
  stock: "all" | StockLevel | "archived";
  publication: "" | "none" | "pending" | "in_review" | "published" | "hidden" | "rejected" | "changes_pending";
  catalog: "" | "matched" | "unmatched";
  category: string;
  sort: "updated" | "name" | "available_asc" | "available_desc" | "price_asc" | "price_desc";
};

export type InventoryCursor = { value: string; id: string };

export const STOCK_FILTERS: readonly { value: InventoryFilters["stock"]; label: string }[] = [
  { value: "all", label: "Todos los SKU activos" },
  { value: "in_stock", label: "Disponible" },
  { value: "low", label: "Stock bajo" },
  { value: "out", label: "Agotado" },
  { value: "archived", label: "Archivados" },
];

export const PUBLICATION_FILTERS: readonly { value: InventoryFilters["publication"]; label: string }[] = [
  { value: "", label: "Cualquier publicación" },
  { value: "none", label: "Sin publicación" },
  { value: "published", label: "Publicada" },
  { value: "in_review", label: "En revisión o con cambios en revisión" },
  { value: "pending", label: "En revisión" },
  { value: "changes_pending", label: "Cambios en revisión" },
  { value: "rejected", label: "Rechazada" },
  { value: "hidden", label: "Oculta" },
];

// fix-09: nothing matches SKUs to the catalog yet (the catalog autofill has not reached main), so the "Catálogo"
// filter stays hidden and a catalogo= value in an old URL is ignored. Turn this on together with catalog matching.
export const CATALOG_MATCHING_AVAILABLE = false;

export const CATALOG_FILTERS: readonly { value: InventoryFilters["catalog"]; label: string }[] = [
  { value: "", label: "Con o sin catálogo" },
  { value: "matched", label: "Vinculado al catálogo" },
  { value: "unmatched", label: "Sin vínculo al catálogo" },
];

export const SORTS: readonly { value: InventoryFilters["sort"]; label: string }[] = [
  { value: "updated", label: "Cambios recientes" },
  { value: "name", label: "Nombre (A–Z)" },
  { value: "available_asc", label: "Menos stock disponible" },
  { value: "available_desc", label: "Más stock disponible" },
  { value: "price_asc", label: "Menor precio" },
  { value: "price_desc", label: "Mayor precio" },
];

const DEFAULT_FILTERS: InventoryFilters = { q: "", stock: "all", publication: "", catalog: "", category: "", sort: "updated" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function pick<T extends string>(value: string, options: readonly { value: T }[], fallback: T): T {
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

// Unknown values fall back to the defaults instead of failing the page; get_inventory_page validates again.
export function parseInventoryFilters(params: SearchParams): { filters: InventoryFilters; cursor: InventoryCursor | null } {
  const filters: InventoryFilters = {
    q: first(params.q).slice(0, 100),
    stock: pick(first(params.stock), STOCK_FILTERS, "all"),
    publication: pick(first(params.publicacion), PUBLICATION_FILTERS, ""),
    catalog: CATALOG_MATCHING_AVAILABLE ? pick(first(params.catalogo), CATALOG_FILTERS, "") : "",
    category: first(params.categoria).slice(0, 80),
    sort: pick(first(params.orden), SORTS, "updated"),
  };
  return { filters, cursor: decodeCursor(first(params.despues)) };
}

// URL for the inventory table with the given filters; only non-default values are written.
export function inventoryHref(filters: InventoryFilters, cursor?: InventoryCursor | null) {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.stock !== DEFAULT_FILTERS.stock) query.set("stock", filters.stock);
  if (filters.publication) query.set("publicacion", filters.publication);
  if (filters.catalog) query.set("catalogo", filters.catalog);
  if (filters.category) query.set("categoria", filters.category);
  if (filters.sort !== DEFAULT_FILTERS.sort) query.set("orden", filters.sort);
  if (cursor) query.set("despues", encodeCursor(cursor));
  const text = query.toString();
  return `/mi-cuenta/tienda/inventario${text ? `?${text}` : ""}`;
}

export function activeFilterCount(filters: InventoryFilters) {
  return [filters.stock !== "all", Boolean(filters.publication), Boolean(filters.catalog), Boolean(filters.category)].filter(Boolean).length;
}

export function encodeCursor(cursor: InventoryCursor) {
  return Buffer.from(JSON.stringify([cursor.value, cursor.id])).toString("base64url");
}

export function decodeCursor(value: string): InventoryCursor | null {
  if (!value || value.length > 400) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string" && UUID.test(parsed[1])) {
      return { value: parsed[0], id: parsed[1] };
    }
  } catch {
    // A tampered cursor restarts at the first page.
  }
  return null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------------ labels (D-13)

// The stock tag of a row: an archived SKU reads "Archivado" whatever its quantity.
export function inventoryStatusKey(item: Pick<InventoryItem, "inventory_status" | "stock_level">) {
  return item.inventory_status === "archived" ? "archived" : item.stock_level;
}

export const MOVEMENT_LABELS: Record<string, string> = {
  opening_balance: "Stock inicial",
  sale: "Venta registrada por la tienda",
  return: "Devolución",
  restock: "Reposición",
  damage_or_loss: "Daño o pérdida",
  manual_adjustment: "Ajuste",
  stock_count: "Conteo",
  import_reconciliation: "Importación",
  reservation: "Reserva",
  reservation_release: "Reserva liberada",
  external_sync: "Sincronización",
};

export const CHANNEL_LABELS: Record<string, string> = {
  tienda_fisica: "Tienda física",
  whatsapp_laria: "WhatsApp / Laria",
  redes_sociales: "Redes sociales",
  otro: "Otro canal",
  panel: "Inventario",
  importacion: "Importación",
  administracion: "Administración",
  sistema: "Laria",
  integracion: "Integración",
};

export const SALE_CHANNELS = ["tienda_fisica", "whatsapp_laria", "redes_sociales", "otro"] as const;

export const ACTOR_LABELS: Record<string, string> = { owner: "Tu tienda", admin: "Administración", system: "Laria" };

export const CHANGE_LABELS: Record<string, string> = {
  created: "SKU creado",
  details: "Datos editados",
  sku: "Cambio de SKU",
  price: "Cambio de precio",
  link: "Publicación vinculada",
  unlink: "Publicación desvinculada",
  archive: "SKU archivado",
  unarchive: "SKU reactivado",
};

// "Disponible 7 · En tienda 7"; reserved units appear only once reservations exist (D-4).
export function stockLine(item: Pick<InventoryItem, "quantity_available" | "quantity_on_hand" | "quantity_reserved">) {
  const parts = [`Disponible ${numbers.format(item.quantity_available)}`, `En tienda ${numbers.format(item.quantity_on_hand)}`];
  if (item.quantity_reserved > 0) parts.push(`Reservado ${numbers.format(item.quantity_reserved)}`);
  return parts.join(" · ");
}

export const numbers = new Intl.NumberFormat("es-PE");
const dateTimes = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin movimientos";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateTimes.format(date) : "No disponible";
}

export function signed(value: number) {
  return value > 0 ? `+${numbers.format(value)}` : value < 0 ? `−${numbers.format(-value)}` : "0";
}

// ------------------------------------------------------------------ errors

// The functions raise "CODE: mensaje en español". Known inventory codes pass their Spanish message through; anything
// else (a network or PostgREST failure) is replaced by a generic message and stays in the logs.
const KNOWN_CODE = /^((INVENTORY|STOCK|IDEMPOTENCY|LISTING|STORE)_[A-Z_]+): ([\s\S]+)$/;

export function inventoryError(raw: string | null | undefined): { code: string; message: string } {
  const match = raw ? KNOWN_CODE.exec(raw.trim()) : null;
  if (match) return { code: match[1], message: match[3] };
  return { code: "UNKNOWN", message: "No se pudo guardar el cambio. Intenta de nuevo." };
}

export const RETRYABLE_CODES = new Set(["INVENTORY_CONCURRENT_CHANGE"]);
export const CONFLICT_CODES = new Set(["INVENTORY_VERSION_CONFLICT", "IDEMPOTENCY_KEY_REUSED", "INVENTORY_CONCURRENT_CHANGE"]);

// ------------------------------------------------------------------ reads

// The inventory tables and functions are not in the generated Database type yet (the combined prototype regenerates
// it), so inventory reads use an untyped view of the same authenticated client. RLS and the functions still decide
// what the caller sees.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function inventoryDb(supabase: SupabaseClient<any, any, any>): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function getInventorySummary(supabase: AnyClient): Promise<InventorySummary | null> {
  const { data, error } = await inventoryDb(supabase).rpc("get_inventory_summary");
  if (error || !data) return null;
  return data as InventorySummary;
}

// "Errores de importación" tile: rows of the latest committed import that did not apply (validation errors, conflicts
// and failures; rows the owner excluded are not errors). RLS limits
// the read to the owner's own store. Null when the store has never finished an import, so the tile is not shown.
export async function getLastImportErrors(supabase: AnyClient): Promise<{ errors: number; href: string } | null> {
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from("store_import_sessions")
    .select("id,result_summary")
    .in("status", ["committed", "partially_committed"])
    .is("options->>source", null) // not a "Publicar seleccionados" batch (Effortless Laria, stores: stock-10)
    .order("committed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const summary = (data.result_summary ?? {}) as Record<string, number | undefined>;
  return {
    errors: (summary.error ?? 0) + (summary.conflict ?? 0) + (summary.failed ?? 0),
    href: `/mi-cuenta/tienda/inventario/importar/${data.id}`,
  };
}

// Category chips above the inventory table (review fix B4): active SKUs per category, "none" for SKUs without one.
export const INVENTORY_NO_CATEGORY = "none";

export async function getInventoryCategoryCounts(supabase: AnyClient): Promise<Record<string, number> | null> {
  const { data, error } = await inventoryDb(supabase).rpc("get_inventory_category_counts");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, number>;
}

export async function getInventoryPage(
  supabase: AnyClient,
  filters: InventoryFilters,
  cursor: InventoryCursor | null,
  limit = 50,
): Promise<{ items: InventoryItem[]; nextCursor: InventoryCursor | null } | null> {
  const { data, error } = await inventoryDb(supabase).rpc("get_inventory_page", {
    p_filters: {
      q: filters.q || null,
      stock: filters.stock,
      publication: filters.publication || null,
      catalog: filters.catalog || null,
      category: filters.category || null,
      sort: filters.sort,
    },
    p_cursor: cursor,
    p_limit: limit,
  });
  if (error || !data) return null;
  const page = data as { items: InventoryItem[]; next_cursor: InventoryCursor | null };
  return { items: page.items ?? [], nextCursor: page.next_cursor ?? null };
}

const ITEM_COLUMNS =
  "id,store_id,merchant_sku,sku_generated,product_name,variant_label,quantity_on_hand,quantity_reserved,quantity_available,low_stock_threshold,unit_price_pen,inventory_status,stock_source,external_reference,catalog_product_id,catalog_variant_id,listing_id,category,version,last_movement_at,created_at,updated_at";

// One SKU with its linked publication, read through RLS (owner or Admin only).
export async function getInventoryItem(supabase: AnyClient, itemId: string): Promise<InventoryItem | null> {
  if (!UUID.test(itemId)) return null;
  const db = inventoryDb(supabase);
  const { data, error } = await db.from("store_inventory_items").select(ITEM_COLUMNS).eq("id", itemId).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as Omit<InventoryItem, "stock_level" | "listing">;
  let listing: InventoryListing | null = null;
  if (row.listing_id) {
    const [{ data: listingRow }, { count }] = await Promise.all([
      db.from("listings").select("id,slug,title,status,stock_state,category,price_pen").eq("id", row.listing_id).maybeSingle(),
      db.from("listing_revisions").select("id", { count: "exact", head: true }).eq("listing_id", row.listing_id).eq("status", "pending"),
    ]);
    if (listingRow) listing = { ...(listingRow as Omit<InventoryListing, "has_pending_revision">), has_pending_revision: (count ?? 0) > 0 };
  }
  return { ...row, stock_level: stockLevel(row.quantity_available, row.low_stock_threshold), listing };
}

// Same rule as laria_private.inventory_stock_level.
export function stockLevel(available: number, threshold: number | null): StockLevel {
  if (available <= 0) return "out";
  if (threshold !== null && available <= threshold) return "low";
  return "in_stock";
}

export type MovementCursor = { createdAt: string; id: string };

// Newest first, keyset paged on (created_at, id) like the store_stock_movements_item_idx index.
export async function getItemMovements(
  supabase: AnyClient,
  itemId: string,
  before: MovementCursor | null,
  limit = 25,
): Promise<{ movements: StockMovement[]; next: MovementCursor | null }> {
  let query = inventoryDb(supabase)
    .from("store_stock_movements")
    .select("id,item_id,movement_type,channel,on_hand_delta,on_hand_before,on_hand_after,actor_kind,reference,reason,import_session_id,import_row_number,created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (before) {
    const at = `"${before.createdAt}"`;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${before.id})`);
  }
  const { data } = await query;
  const rows = (data ?? []) as StockMovement[];
  const more = rows.length > limit;
  const movements = more ? rows.slice(0, limit) : rows;
  const last = movements[movements.length - 1];
  return { movements, next: more && last ? { createdAt: last.created_at, id: last.id } : null };
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export function encodeMovementCursor(cursor: MovementCursor) {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString("base64url");
}

export function decodeMovementCursor(value: string | undefined): MovementCursor | null {
  if (!value || value.length > 200) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    // The timestamp is kept as Postgres wrote it (microseconds), so the keyset comparison is exact.
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && TIMESTAMP.test(parsed[0]) && typeof parsed[1] === "string" && UUID.test(parsed[1])) {
      return { createdAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // A tampered cursor restarts at the newest movement.
  }
  return null;
}

export async function getItemChanges(supabase: AnyClient, itemId: string, limit = 20): Promise<InventoryChange[]> {
  const { data } = await inventoryDb(supabase)
    .from("store_inventory_changes")
    .select("id,change_type,before,after,actor_kind,reason,created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return (data ?? []) as InventoryChange[];
}

// Item ids linked to the given listings, for the Publicaciones table (hides "Marcar vendida", D-15).
export async function getLinkedItemsByListing(supabase: AnyClient, listingIds: string[]): Promise<Map<string, string>> {
  if (!listingIds.length) return new Map();
  const { data, error } = await inventoryDb(supabase).from("store_inventory_items").select("id,listing_id").in("listing_id", listingIds);
  if (error) return new Map();
  return new Map(((data ?? []) as { id: string; listing_id: string }[]).map((row) => [row.listing_id, row.id]));
}
