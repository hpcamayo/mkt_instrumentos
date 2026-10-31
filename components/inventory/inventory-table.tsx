"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PublishSelectedButton } from "@/components/store-import/publish-selection";
import {
  BulkCategorySheet, BulkHideSheet, BulkLifecycleSheet, BulkPriceSheet, BulkStockSheet, BulkThresholdSheet,
  type BulkItem, type BulkTarget,
} from "@/components/inventory/bulk-actions";
import { StockActionSheet, undoMovements, type StockActionItem, type StockActionType } from "@/components/inventory/stock-action-sheet";
import { BulkArrivalSheet } from "@/components/store-floor/arrival-control";
import { UndoNotice, type InventoryNotice, type UndoAction } from "@/components/inventory/undo-notice";
import { buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { StatusTag } from "@/components/ui/tag";
import { INVENTORY_BULK_LIMIT } from "@/lib/inventory-actions";
import { arrivalTag } from "@/lib/store-floor/arrivals";
import { inventoryAction, newRequestKey } from "@/lib/inventory-client";
import {
  exportViewHref, formatDateTime, inventoryStatusKey, numbers, stockLine, type InventoryFilters, type InventoryItem,
} from "@/lib/store-inventory";

// The Inventario table (design §13.1): one row per SKU, row actions and the bulk bar. Reads come from
// get_inventory_page on the server; every change goes through /api/store/inventory.
// Effortless Laria, inventory batch: −1/+1 on each row (stock-02), "Deshacer" after every change (stock-03), selecting
// every SKU that matches (stock-14), more bulk actions, and v/r/a on the focused row (stock-18).

type BulkKind = "price" | "threshold" | "stock" | "hide" | "category" | "archive" | "unarchive" | "restore" | "arrival";

// The stepper's sale is a counter sale; the sheet stays for any other channel, a count or a note.
const STEPPER_CHANNEL = "tienda_fisica";

// store-locations (run-02): `locationLines` is "Miraflores 3 · Centro 1" per SKU id, for stores with sedes.
export function InventoryTable({ items, canWrite, total, filters, listQuery = "", locationLines }: { items: InventoryItem[]; canWrite: boolean; total?: number; filters?: InventoryFilters; listQuery?: string; locationLines?: Record<string, string> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // stock-14: every id of the view (up to the bulk limit), when the owner asked for all that match.
  const [matching, setMatching] = useState<string[] | null>(null);
  const [matchingBusy, setMatchingBusy] = useState(false);
  const [stockAction, setStockAction] = useState<{ item: StockActionItem; type: StockActionType; opener: HTMLElement | null } | null>(null);
  const [bulk, setBulk] = useState<{ kind: BulkKind; opener: HTMLElement | null } | null>(null);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const viewTotal = total ?? items.length;
  // stock-19: the SKU page knows the list it came from.
  const itemHref = (item: InventoryItem) => `/mi-cuenta/tienda/inventario/${item.id}${listQuery ? `?lista=${encodeURIComponent(listQuery)}` : ""}`;
  const archivedView = filters?.stock === "archived";

  const selectedItems = matching ? items.filter((item) => matching.includes(item.id)) : items.filter((item) => selected.has(item.id));
  const selectedCount = matching ? matching.length : selectedItems.length;
  const allOnPage = items.length > 0 && items.every((item) => selected.has(item.id));
  const bulkItems: BulkItem[] = selectedItems.map((item) => ({
    id: item.id,
    merchant_sku: item.merchant_sku,
    product_name: item.product_name,
    quantity_available: item.quantity_available,
    quantity_on_hand: item.quantity_on_hand,
    unit_price_pen: item.unit_price_pen,
    low_stock_threshold: item.low_stock_threshold,
    version: item.version,
    listing_status: item.listing?.status ?? null,
  }));
  const target: BulkTarget = { ids: matching ?? selectedItems.map((item) => item.id), items: bulkItems };
  const changeNotice = useCallback((next: InventoryNotice) => setNotice(next), []);

  async function selectMatching() {
    if (!filters) return;
    setMatchingBusy(true);
    const result = await inventoryAction<{ ids: string[]; total: number }>({ action: "view_ids", filters: viewFilterBody(filters) });
    setMatchingBusy(false);
    if (!result.ok) return setNotice({ kind: "error", message: result.message });
    setMatching(result.data.ids);
  }

  function clearSelection() {
    setSelected(new Set());
    setMatching(null);
  }

  // stock-02: one unit sold at the counter or received, without a sheet.
  async function step(item: InventoryItem, type: "sale" | "restock") {
    setBusyId(item.id);
    setNotice(null);
    const result = await inventoryAction<{ item: { quantity_available: number }; movement: { id: string } }>({
      action: "movement", key: newRequestKey("paso"), item_id: item.id, type, quantity: 1,
      channel: type === "sale" ? STEPPER_CHANNEL : null,
    });
    setBusyId(null);
    if (!result.ok) return setNotice({ kind: "error", message: result.message });
    const left = numbers.format(result.data.item.quantity_available);
    setNotice({
      kind: "success",
      message: type === "sale" ? `Venta de 1 unidad registrada en ${item.merchant_sku} (tienda física). Quedan ${left} disponibles.` : `1 unidad repuesta en ${item.merchant_sku}. Hay ${left} disponibles.`,
      undo: undoMovements([result.data.movement.id], `Deshecho. ${item.merchant_sku} volvió a como estaba.`),
    });
    router.refresh();
  }

  // stock-18: v, r and a on the focused row.
  function rowShortcut(item: InventoryItem, key: string, opener: HTMLElement) {
    if (!canWrite || item.inventory_status !== "active") return false;
    const type: StockActionType | null = key === "v" ? "sale" : key === "r" ? "restock" : key === "a" ? "stock_count" : null;
    if (!type || (type === "sale" && item.quantity_available < 1)) return false;
    openStock(item, type, opener);
    return true;
  }

  function openStock(item: InventoryItem, type: StockActionType, opener: HTMLElement) {
    setNotice(null);
    setStockAction({ item, type, opener });
  }

  function closeStock() {
    const opener = stockAction?.opener;
    setStockAction(null);
    requestAnimationFrame(() => opener?.focus());
  }

  function closeBulk() {
    const opener = bulk?.opener;
    setBulk(null);
    requestAnimationFrame(() => opener?.focus());
  }

  function done(message: string, undo?: UndoAction, clear = false) {
    setStockAction(null);
    setBulk(null);
    if (clear) clearSelection();
    setNotice({ kind: "success", message, undo });
  }

  async function hideListing(item: InventoryItem) {
    if (!item.listing) return;
    const ok = await confirm({
      title: "¿Ocultar esta publicación del marketplace?",
      body: "Dejará de verse en el catálogo. El stock del SKU no cambia y podrás restaurarla desde Publicaciones.",
      confirmLabel: "Ocultar",
    });
    if (!ok) return;
    setBusyId(item.id);
    setNotice(null);
    const response = await fetch(`/api/listings/${item.listing.id}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hide" }),
    });
    const result = await response.json().catch(() => null);
    setBusyId(null);
    if (!response.ok) {
      setNotice({ kind: "error", message: result?.message ?? "No se pudo ocultar la publicación." });
      return;
    }
    const key = newRequestKey("publicar");
    setNotice({
      kind: "success",
      message: "Publicación oculta. El stock no cambió.",
      undo: { done: "La publicación volvió a verse.", run: () => inventoryAction({ action: "bulk_action", bulk: "restore", key, item_ids: [item.id] }) },
    });
    router.refresh();
  }

  const columns: DataTableColumn<InventoryItem>[] = [
    {
      key: "sku",
      header: "SKU",
      primary: true,
      cell: (item) => (
        <div className="min-w-0 md:min-w-40 md:max-w-xs">
          <Link href={itemHref(item)} className="link font-semibold">{item.product_name}</Link>
          <p className="mt-0.5 t-meta">
            <span className="font-semibold text-ink">{item.merchant_sku}</span>
            {item.variant_label ? ` · ${item.variant_label}` : null}
          </p>
        </div>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      label: "Stock",
      cell: (item) => (
        <div className="grid justify-items-end gap-1 md:justify-items-start">
          <StatusTag domain="inventory" status={inventoryStatusKey(item)} />
          {item.expected_arrival_on ? <span className="whitespace-nowrap t-meta font-semibold text-ink">{arrivalTag(item.expected_arrival_on)}</span> : null}
          <span className="whitespace-nowrap t-meta tabular-nums">{stockLine(item)}</span>
          {locationLines?.[item.id] ? <span className="t-meta tabular-nums">{locationLines[item.id]}</span> : null}
          {canWrite && item.inventory_status === "active" ? (
            <span className="flex items-center gap-2" role="group" aria-label={`Cambiar el stock de ${item.merchant_sku} en una unidad`}>
              <StepButton disabled={busyId === item.id || item.quantity_available < 1} label={`Registrar venta de 1 unidad de ${item.merchant_sku}`} onClick={() => step(item, "sale")}>−1</StepButton>
              <StepButton disabled={busyId === item.id} label={`Reponer 1 unidad de ${item.merchant_sku}`} onClick={() => step(item, "restock")}>+1</StepButton>
            </span>
          ) : null}
          <span className="t-meta">Último movimiento: {formatDateTime(item.last_movement_at)}</span>
        </div>
      ),
    },
    { key: "price", header: "Precio", label: "Precio", className: "whitespace-nowrap", cell: (item) => <Price value={item.unit_price_pen} size="inline" /> },
    {
      key: "listing",
      header: "Publicación",
      label: "Publicación",
      cell: (item) =>
        item.listing ? (
          <div className="grid justify-items-end gap-1 md:justify-items-start">
            <StatusTag domain="listing" status={item.listing.status} />
            {item.listing.has_pending_revision ? <span className="t-meta">Cambios en revisión</span> : null}
          </div>
        ) : (
          <span className="t-meta">Sin publicación</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Acciones</span>,
      cell: (item) => {
        const active = item.inventory_status === "active";
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-2 md:min-w-36 md:max-w-52">
            {canWrite && active ? (
              <>
                <RowButton disabled={item.quantity_available < 1} onClick={(event) => openStock(item, "sale", event.currentTarget)}>Registrar venta</RowButton>
                <RowButton onClick={(event) => openStock(item, "restock", event.currentTarget)}>Reponer stock</RowButton>
                <RowButton onClick={(event) => openStock(item, "stock_count", event.currentTarget)}>Ajustar</RowButton>
              </>
            ) : null}
            <Link href={itemHref(item)} className={ROW_LINK}>Editar</Link>
            {item.listing && item.listing.status === "approved" ? (
              <Link href={`/instrumentos/${item.listing.slug}`} className={ROW_LINK}>Ver publicación</Link>
            ) : null}
            {canWrite && item.listing?.status === "approved" ? (
              <RowButton disabled={busyId === item.id} onClick={() => hideListing(item)}>{busyId === item.id ? "Procesando…" : "Ocultar"}</RowButton>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      {confirmDialog}
      {notice ? <div className="border-b border-subtle p-3"><UndoNotice notice={notice} onChange={changeNotice} /></div> : null}
      {allOnPage && viewTotal > items.length ? (
        <div className="border-b border-subtle bg-accent-tint px-4 py-3 t-ui" role="status">
          {matching ? (
            <>
              {matching.length < viewTotal
                ? `Seleccionaste los primeros ${numbers.format(matching.length)} de ${numbers.format(viewTotal)} SKU que coinciden (el máximo por acción).`
                : `Seleccionaste los ${numbers.format(matching.length)} SKU que coinciden.`}{" "}
              <button type="button" className="link font-semibold" onClick={() => setMatching(null)}>Seleccionar solo esta página</button>
            </>
          ) : (
            <>
              Seleccionaste los {numbers.format(items.length)} SKU de esta página.{" "}
              <button type="button" className="link font-semibold" disabled={matchingBusy} onClick={selectMatching}>
                {matchingBusy ? "Seleccionando…" : viewTotal > INVENTORY_BULK_LIMIT ? `Seleccionar los primeros ${numbers.format(INVENTORY_BULK_LIMIT)} que coinciden` : `Seleccionar los ${numbers.format(viewTotal)} que coinciden`}
              </button>
            </>
          )}
        </div>
      ) : null}
      {!items.length ? <EmptyState className="rounded-none border-0" title={filters?.q || filters?.stock !== "all" || listQuery ? "Ningún SKU coincide con la búsqueda" : "Aún no tienes SKU en Inventario"} description="Crea un SKU o quita los filtros para ver todo tu inventario." /> : null}
      {selectedCount ? (
        <div role="region" aria-label="Acciones para los SKU seleccionados" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-strong bg-surface px-4 py-3">
          <p className="t-ui font-semibold text-ink" aria-live="polite">{numbers.format(selectedCount)} SKU seleccionados</p>
          {canWrite ? (
            archivedView ? (
              <RowButton onClick={(event) => setBulk({ kind: "unarchive", opener: event.currentTarget })}>Reactivar</RowButton>
            ) : (
              <>
                <RowButton onClick={(event) => setBulk({ kind: "price", opener: event.currentTarget })}>Cambiar precios</RowButton>
                <RowButton onClick={(event) => setBulk({ kind: "threshold", opener: event.currentTarget })}>Umbral de stock bajo</RowButton>
                <RowButton onClick={(event) => setBulk({ kind: "category", opener: event.currentTarget })}>Categoría</RowButton>
                {!matching ? <RowButton onClick={(event) => setBulk({ kind: "stock", opener: event.currentTarget })}>Ajustar stock</RowButton> : null}
                {/* store-floor, reach-08: like Ajustar stock, only rows the owner ticked. */}
                {!matching ? <RowButton onClick={(event) => setBulk({ kind: "arrival", opener: event.currentTarget })}>Por llegar</RowButton> : null}
                <RowButton onClick={(event) => setBulk({ kind: "hide", opener: event.currentTarget })}>Ocultar</RowButton>
                <RowButton onClick={(event) => setBulk({ kind: "restore", opener: event.currentTarget })}>Volver a publicar</RowButton>
                <RowButton onClick={(event) => setBulk({ kind: "archive", opener: event.currentTarget })}>Archivar</RowButton>
                {/* stock-10 (stores batch): only rows the owner ticked, like Ajustar stock; a whole filter is not sent. */}
                {!matching ? <PublishSelectedButton itemIds={selectedItems.filter((item) => !item.listing && item.inventory_status === "active").map((item) => item.id)} className={`${ROW_LINK} disabled:cursor-not-allowed disabled:opacity-50`} /> : null}
              </>
            )
          ) : null}
          {/* store-floor, reach-10: price labels for the selection (the labels page reads "all that match" from the view). */}
          {!archivedView ? (
            <Link href={matching ? `/mi-cuenta/tienda/etiquetas?lista=${encodeURIComponent(listQuery)}` : `/mi-cuenta/tienda/etiquetas?ids=${selectedItems.map((item) => item.id).join(",")}`} className={ROW_LINK}>Imprimir etiquetas</Link>
          ) : null}
          {matching && filters ? (
            <>
              <a href={exportViewHref(filters, "csv")} className={ROW_LINK}>Exportar CSV</a>
              <a href={exportViewHref(filters, "xlsx")} className={ROW_LINK}>Exportar Excel</a>
            </>
          ) : (
            <>
              <a href={`/api/store/inventory/export?format=csv&ids=${selectedItems.map((item) => item.id).join(",")}`} className={ROW_LINK}>Exportar CSV</a>
              <a href={`/api/store/inventory/export?format=xlsx&ids=${selectedItems.map((item) => item.id).join(",")}`} className={ROW_LINK}>Exportar Excel</a>
            </>
          )}
          <button type="button" className={buttonClasses({ variant: "quiet", className: "ml-auto" })} onClick={clearSelection}>Quitar selección</button>
        </div>
      ) : null}
      <DataTable
        caption="SKU de tu inventario"
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        onRowShortcut={rowShortcut}
        selection={{
          selected,
          rowLabel: (item) => `Seleccionar ${item.merchant_sku}`,
          onToggle: (id) => {
            setMatching(null);
            setSelected((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          },
          onToggleAll: (select) => {
            setMatching(null);
            setSelected(select ? new Set(items.map((item) => item.id)) : new Set());
          },
        }}
      />
      {stockAction ? (
        <StockActionSheet item={stockAction.item} initialType={stockAction.type} onClose={closeStock} onDone={(message, undo) => done(message, undo)} />
      ) : null}
      {bulk?.kind === "price" ? <BulkPriceSheet target={target} onClose={closeBulk} onDone={(message, undo) => done(message, undo, true)} /> : null}
      {bulk?.kind === "threshold" ? <BulkThresholdSheet target={target} onClose={closeBulk} onDone={(message, undo) => done(message, undo, true)} /> : null}
      {bulk?.kind === "category" ? <BulkCategorySheet target={target} onClose={closeBulk} onDone={(message, undo) => done(message, undo, true)} /> : null}
      {bulk?.kind === "stock" ? <BulkStockSheet target={target} onClose={closeBulk} onDone={(message, undo) => done(message, undo, true)} /> : null}
      {bulk?.kind === "hide" ? <BulkHideSheet target={target} onClose={closeBulk} onDone={(message, undo) => done(message, undo, true)} /> : null}
      {bulk?.kind === "arrival" ? <BulkArrivalSheet items={bulkItems} onClose={closeBulk} onDone={(message) => done(message, undefined, true)} /> : null}
      {bulk?.kind === "archive" || bulk?.kind === "unarchive" || bulk?.kind === "restore" ? (
        <BulkLifecycleSheet action={bulk.kind} target={target} onClose={closeBulk} onDone={(message, undo) => done(message, undo, true)} />
      ) : null}
    </div>
  );
}

// fast-04: row and bar actions are text links at least 24 px tall, so a tap never lands on the neighbour.
const ROW_LINK = "link inline-flex min-h-11 items-center font-semibold md:min-h-6";

function RowButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${ROW_LINK} disabled:cursor-not-allowed disabled:opacity-50`}>
      {children}
    </button>
  );
}

// stock-02: 24 px or more, labelled with what it does, never by the sign alone.
function StepButton({ children, disabled, label, onClick }: { children: React.ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 min-w-11 items-center justify-center rounded-control border border-line-strong bg-white px-2 t-ui font-semibold tabular-nums text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function viewFilterBody(filters: InventoryFilters) {
  return { q: filters.q, stock: filters.stock, publication: filters.publication, category: filters.category, sort: filters.sort, price: filters.price };
}
