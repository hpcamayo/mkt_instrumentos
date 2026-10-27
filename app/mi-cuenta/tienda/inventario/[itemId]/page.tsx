import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArchiveButton,
  DuplicateSkuButton,
  ItemCategoryForm,
  ItemDetailsForm,
  ItemStockActions,
  LinkListingForm,
  PublishFromSkuLink,
  SkuChangeButton,
  UndoMovementButton,
  UnlinkListingButton,
  type LinkCandidate,
} from "@/components/inventory/item-detail";
import { SkuListingDetailsPanel, type SkuListingDetails } from "@/components/inventory/sku-listing-details";
import { ArrivalForm } from "@/components/store-floor/arrival-control";
// Feature ideas, accounts batch (safe-02): private serial numbers.
import { InventorySerials } from "@/components/stolen-gear/inventory-serials";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { StatusTag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { formatPrice } from "@/lib/price";
import { longDate } from "@/lib/store-floor/dates";
import {
  ACTOR_LABELS,
  CHANGE_LABELS,
  CHANNEL_LABELS,
  MOVEMENT_LABELS,
  decodeMovementCursor,
  encodeMovementCursor,
  formatDateTime,
  getInventoryItem,
  getInventorySummary,
  getItemChanges,
  getInventoryNeighbors,
  getItemMovements,
  getLinkedItemsByListing,
  getSkuListingDetails,
  inventoryDb,
  inventoryHref,
  inventoryStatusKey,
  numbers,
  parseInventoryFilters,
  signed,
} from "@/lib/store-inventory";

// Matches laria_private.inventory_undo_window (stock-03).
const UNDO_WINDOW_MS = 15 * 60 * 1000;
const UNDOABLE_TYPES = new Set(["sale", "return", "restock", "damage_or_loss", "manual_adjustment", "stock_count"]);

export const metadata = { title: "SKU de inventario" };

type Props = { params: Promise<{ itemId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

// One SKU (design §13.2): stock card, movement history, linked publication, catalog match, SKU change and archive.
export default async function InventoryItemPage({ params, searchParams }: Props) {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { itemId } = await params;
  const query = (await searchParams) ?? {};
  const before = decodeMovementCursor(typeof query.antes === "string" ? query.antes : undefined);
  // stock-19: the list this SKU was opened from (filters and page), for Anterior/Siguiente and the way back.
  const listQuery = typeof query.lista === "string" && query.lista.length <= 1200 ? query.lista : "";
  const list = parseInventoryFilters(Object.fromEntries(new URLSearchParams(listQuery)));
  const listHref = inventoryHref(list.filters, list.cursor);
  const withList = (id: string) => `/mi-cuenta/tienda/inventario/${id}${listQuery ? `?lista=${encodeURIComponent(listQuery)}` : ""}`;
  const [item, summary] = await Promise.all([getInventoryItem(supabase, itemId), getInventorySummary(supabase)]);
  if (!item || item.store_id !== store.id) notFound();
  const canWrite = Boolean(summary?.can_write);

  const [history, changes, candidates, neighbors, listingDetails] = await Promise.all([
    getItemMovements(supabase, item.id, before),
    getItemChanges(supabase, item.id),
    item.listing_id || !canWrite ? Promise.resolve([] as LinkCandidate[]) : linkCandidates(store.id),
    getInventoryNeighbors(supabase, item.id, list.filters),
    item.listing_id ? Promise.resolve(undefined) : getSkuListingDetails<SkuListingDetails>(supabase, item.id),
  ]);
  // stock-03: which movements on this page a later correction cancelled.
  const movementIds = history.movements.map((movement) => movement.id);
  const { data: corrections } = movementIds.length
    ? await inventoryDb(supabase).from("store_stock_movements").select("corrects_movement_id").in("corrects_movement_id", movementIds)
    : { data: [] };
  const undone = new Set(((corrections ?? []) as { corrects_movement_id: string }[]).map((row) => row.corrects_movement_id));
  const now = Date.now();

  async function linkCandidates(storeId: string): Promise<LinkCandidate[]> {
    const { data } = await supabase!
      .from("listings")
      .select("id,title,status,price_pen")
      .eq("store_id", storeId)
      .in("status", ["draft", "pending", "approved", "hidden", "rejected"])
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as LinkCandidate[];
    const linked = await getLinkedItemsByListing(supabase!, rows.map((row) => row.id));
    return rows.filter((row) => !linked.has(row.id));
  }

  const archived = item.inventory_status === "archived";
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Breadcrumbs items={[{ label: "Inventario", href: listHref }, { label: item.merchant_sku }]} />
        {neighbors?.position ? (
          <nav aria-label="Otros SKU de la lista" className="flex items-center gap-4 t-ui">
            <span className="t-meta tabular-nums">{numbers.format(neighbors.position)} de {numbers.format(neighbors.total)}</span>
            {neighbors.previous_id ? <Link href={withList(neighbors.previous_id)} rel="prev" className="link font-semibold">Anterior</Link> : null}
            {neighbors.next_id ? <Link href={withList(neighbors.next_id)} rel="next" className="link font-semibold">Siguiente</Link> : null}
          </nav>
        ) : null}
      </div>
      <PageHeader
        eyebrow={`SKU ${item.merchant_sku}${item.sku_generated ? " · generado por Laria" : ""}`}
        title={item.product_name}
        meta={item.variant_label ?? undefined}
        actions={<StatusTag domain="inventory" status={inventoryStatusKey(item)} />}
      />
      {query.creado === "1" ? <Notice tone="success" role="status">SKU creado. Su stock inicial quedó en el historial.</Notice> : null}
      {!canWrite ? <Notice tone="warning" role="note">Tu tienda no puede registrar cambios de inventario en este momento. Puedes consultar el SKU y su historial.</Notice> : null}

      <section aria-labelledby="stock-titulo" className="grid gap-4 rounded-panel border border-subtle bg-white p-5">
        <h2 id="stock-titulo" className="t-section text-ink">Stock</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Disponible" value={numbers.format(item.quantity_available)} />
          <Figure label="En tienda" value={numbers.format(item.quantity_on_hand)} />
          {item.quantity_reserved > 0 ? <Figure label="Reservado" value={numbers.format(item.quantity_reserved)} /> : null}
          <Figure label="Stock bajo desde" value={item.low_stock_threshold === null ? "Sin aviso" : numbers.format(item.low_stock_threshold)} />
          <Figure label="Precio" value={<Price value={item.unit_price_pen} size="inline" />} />
        </dl>
        <p className="t-meta">Stock informado por tu tienda. Último movimiento: {formatDateTime(item.last_movement_at)}</p>
        {canWrite && !archived ? <ItemStockActions item={item} /> : null}
        {/* store-floor, reach-08 "Por llegar" and reach-10 labels. */}
        {canWrite && !archived && item.quantity_available <= 0 ? <ArrivalForm key={`llegada-${item.version}`} itemId={item.id} current={item.expected_arrival_on ?? null} /> : null}
        {!archived ? <p className="t-meta"><Link href={`/mi-cuenta/tienda/etiquetas?ids=${item.id}`} className="link font-semibold">Imprimir etiqueta</Link> con precio, código de barras y QR.</p> : null}
      </section>

      <section aria-labelledby="publicacion-titulo" className="grid gap-4 rounded-panel border border-subtle bg-white p-5">
        <h2 id="publicacion-titulo" className="t-section text-ink">Publicación</h2>
        {item.listing ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag domain="listing" status={item.listing.status} />
              {item.listing.stock_state === "out_of_stock" ? <StatusTag domain="stock" status="out_of_stock" /> : null}
              {item.listing.has_pending_revision ? <StatusTag domain="revision" status="pending" /> : null}
            </div>
            <p className="t-body text-ink">{item.listing.title}</p>
            <p className="t-meta">El precio y la disponibilidad de la publicación siguen a este SKU. Al llegar a 0 unidades se muestra como Agotado; no se marca vendida.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {item.listing.status === "approved" ? <Link href={`/instrumentos/${item.listing.slug}`} className="link font-semibold">Ver publicación</Link> : null}
              {canWrite && !["sold", "archived"].includes(item.listing.status) ? <Link href={`/mi-cuenta/publicaciones/${item.listing.id}/editar`} className="link font-semibold">Editar publicación</Link> : null}
              {canWrite ? <UnlinkListingButton item={item} /> : null}
            </div>
          </>
        ) : (
          <>
            <p className="t-body text-ink-2">Este SKU no tiene una publicación en el marketplace.</p>
            {/* STOCK 09 (selling batch): what "Publicar este SKU" starts with. */}
            {archived ? null : <SkuListingDetailsPanel key={`datos-${item.version}-${item.category ?? ""}`} itemId={item.id} category={item.category} details={listingDetails} canWrite={canWrite} />}
            {canWrite && !archived ? (
              <div className="grid gap-4">
                <div><PublishFromSkuLink itemId={item.id} /></div>
                <LinkListingForm item={item} candidates={candidates} />
              </div>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="datos-titulo" className="grid gap-4 rounded-panel border border-subtle bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="datos-titulo" className="t-section text-ink">Datos del SKU</h2>
          <div className="flex flex-wrap gap-x-4">
            {canWrite && !archived ? <DuplicateSkuButton item={item} /> : null}
            {canWrite && !archived ? <SkuChangeButton item={item} /> : null}
            {canWrite ? <ArchiveButton item={item} /> : null}
          </div>
        </div>
        <ItemDetailsForm key={item.version} item={item} canWrite={canWrite} />
        <ItemCategoryForm key={`categoria-${item.version}`} item={item} canWrite={canWrite} />
        <InventorySerials itemId={item.id} canWrite={canWrite && !archived} />
        {/* fix-09: no catalog matching exists yet, so only a real link is mentioned. */}
        {item.catalog_product_id ? <p className="t-meta">Catálogo: vinculado a un modelo del catálogo de Laria.</p> : null}
      </section>

      <section aria-labelledby="historial-titulo" className="grid gap-3 rounded-panel border border-subtle bg-white p-5">
        <h2 id="historial-titulo" className="t-section text-ink">Historial de stock</h2>
        {history.movements.length ? (
          <ol className="divide-y divide-subtle">
            {history.movements.map((movement) => (
              <li key={movement.id} className="grid gap-0.5 py-3 t-ui sm:grid-cols-[1fr_auto] sm:gap-x-6">
                <p className="font-semibold text-ink">
                  {MOVEMENT_LABELS[movement.movement_type] ?? movement.movement_type} <span className="tabular-nums">{signed(movement.on_hand_delta)}</span>
                  {undone.has(movement.id) ? <span className="ml-2 t-meta font-normal">Deshecho</span> : null}
                  {canWrite && !archived && !undone.has(movement.id) && movement.actor_kind === "owner" && UNDOABLE_TYPES.has(movement.movement_type)
                    && movement.on_hand_delta !== 0 && now - new Date(movement.created_at).getTime() < UNDO_WINDOW_MS ? (
                      <span className="ml-3"><UndoMovementButton movementId={movement.id} sku={item.merchant_sku} /></span>
                    ) : null}
                </p>
                <p className="t-meta tabular-nums sm:text-right">{numbers.format(movement.on_hand_before)} → {numbers.format(movement.on_hand_after)} en tienda</p>
                <p className="t-meta sm:col-span-2">
                  {[ACTOR_LABELS[movement.actor_kind] ?? movement.actor_kind, CHANNEL_LABELS[movement.channel] ?? movement.channel, movement.import_row_number ? `fila ${movement.import_row_number}` : null, formatDateTime(movement.created_at)].filter(Boolean).join(" · ")}
                </p>
                {movement.reference || movement.reason ? (
                  <p className="t-meta sm:col-span-2">{[movement.reference ? `Referencia: ${movement.reference}` : null, movement.reason ? `Motivo: ${movement.reason}` : null].filter(Boolean).join(" · ")}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState headingLevel={3} className="border-0 p-0" title="Sin movimientos en este tramo" />
        )}
        <nav aria-label="Páginas del historial" className="flex gap-4 t-ui">
          {before ? <Link href={withList(item.id)} className="link font-semibold">Más recientes</Link> : null}
          {history.next ? <Link href={`${withList(item.id)}${listQuery ? "&" : "?"}antes=${encodeMovementCursor(history.next)}`} className="link font-semibold">Movimientos anteriores</Link> : null}
        </nav>
      </section>

      {changes.length ? (
        <section aria-labelledby="cambios-titulo" className="grid gap-3 rounded-panel border border-subtle bg-white p-5">
          <h2 id="cambios-titulo" className="t-section text-ink">Cambios del SKU</h2>
          <ol className="divide-y divide-subtle">
            {changes.map((change) => (
              <li key={change.id} className="grid gap-0.5 py-3 t-ui">
                <p className="font-semibold text-ink">{CHANGE_LABELS[change.change_type] ?? change.change_type}{describeChange(change.change_type, change.before, change.after)}</p>
                <p className="t-meta">{[ACTOR_LABELS[change.actor_kind] ?? change.actor_kind, formatDateTime(change.created_at), change.reason ? `Motivo: ${change.reason}` : null].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-subtle p-3">
      <dt className="t-meta font-semibold text-ink-2">{label}</dt>
      <dd className="t-section tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function asPrice(value: unknown) {
  return typeof value === "number" ? value : null;
}

function describeChange(type: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  const show = (value: unknown) => (value === null || value === undefined || value === "" ? "vacío" : String(value));
  if (type === "sku") return `: ${show(before.merchant_sku)} → ${show(after.merchant_sku)}`;
  if (type === "price") return `: ${formatPrice(asPrice(before.unit_price_pen))} → ${formatPrice(asPrice(after.unit_price_pen))}`;
  if (type === "arrival") return `: ${typeof after.expected_arrival_on === "string" ? longDate(after.expected_arrival_on) : "sin fecha"}`;
  return "";
}
