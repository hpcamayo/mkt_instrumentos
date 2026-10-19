"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PublishSelectedButton } from "@/components/store-import/publish-selection";
import { BulkHideSheet, BulkPriceSheet, BulkStockSheet, BulkThresholdSheet, type BulkItem } from "@/components/inventory/bulk-actions";
import { StockActionSheet, type StockActionItem, type StockActionType } from "@/components/inventory/stock-action-sheet";
import { PageNotice } from "@/components/page-notice";
import { buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Price } from "@/components/ui/price";
import { StatusTag } from "@/components/ui/tag";
import { formatDateTime, inventoryStatusKey, numbers, stockLine, type InventoryItem } from "@/lib/store-inventory";

// The Inventario table (design §13.1): one row per SKU, row actions and the bulk bar. Reads come from
// get_inventory_page on the server; every change goes through /api/store/inventory.

type BulkKind = "price" | "threshold" | "stock" | "hide";

export function InventoryTable({ items, canWrite }: { items: InventoryItem[]; canWrite: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [stockAction, setStockAction] = useState<{ item: StockActionItem; type: StockActionType; opener: HTMLElement | null } | null>(null);
  const [bulk, setBulk] = useState<{ kind: BulkKind; opener: HTMLElement | null } | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const selectedItems = items.filter((item) => selected.has(item.id));
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

  function done(message: string, clearSelection = false) {
    setStockAction(null);
    setBulk(null);
    if (clearSelection) setSelected(new Set());
    setNotice({ kind: "success", message });
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
    setNotice({ kind: "success", message: "Publicación oculta. El stock no cambió." });
    router.refresh();
  }

  const columns: DataTableColumn<InventoryItem>[] = [
    {
      key: "sku",
      header: "SKU",
      primary: true,
      cell: (item) => (
        <div className="min-w-0 md:min-w-40 md:max-w-xs">
          <Link href={`/mi-cuenta/tienda/inventario/${item.id}`} className="link font-semibold">{item.product_name}</Link>
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
          <span className="whitespace-nowrap t-meta tabular-nums">{stockLine(item)}</span>
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
            <Link href={`/mi-cuenta/tienda/inventario/${item.id}`} className="link font-semibold">Editar</Link>
            {item.listing && item.listing.status === "approved" ? (
              <Link href={`/instrumentos/${item.listing.slug}`} className="link font-semibold">Ver publicación</Link>
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
      {notice ? <div className="border-b border-subtle p-3"><PageNotice kind={notice.kind} message={notice.message} /></div> : null}
      <DataTable
        caption="SKU de tu inventario"
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        selection={{
          selected,
          rowLabel: (item) => `Seleccionar ${item.merchant_sku}`,
          onToggle: (id) => setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          }),
          onToggleAll: (select) => setSelected(select ? new Set(items.map((item) => item.id)) : new Set()),
        }}
      />
      {selectedItems.length ? (
        <div role="region" aria-label="Acciones para los SKU seleccionados" className="sticky bottom-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-strong bg-surface px-4 py-3 shadow-[0_-4px_12px_rgb(5_6_8/0.08)]">
          <p className="t-ui font-semibold text-ink" aria-live="polite">{numbers.format(selectedItems.length)} SKU seleccionados</p>
          {canWrite ? (
            <>
              <RowButton onClick={(event) => setBulk({ kind: "price", opener: event.currentTarget })}>Ajustar precio</RowButton>
              <RowButton onClick={(event) => setBulk({ kind: "threshold", opener: event.currentTarget })}>Umbral de stock bajo</RowButton>
              <RowButton onClick={(event) => setBulk({ kind: "stock", opener: event.currentTarget })}>Ajustar stock</RowButton>
              <RowButton onClick={(event) => setBulk({ kind: "hide", opener: event.currentTarget })}>Ocultar</RowButton>
              <PublishSelectedButton itemIds={selectedItems.filter((item) => !item.listing && item.inventory_status === "active").map((item) => item.id)} className="link font-semibold disabled:cursor-not-allowed disabled:opacity-50" />
            </>
          ) : null}
          <a href={`/api/store/inventory/export?format=csv&ids=${selectedItems.map((item) => item.id).join(",")}`} className="link font-semibold">Exportar CSV</a>
          <a href={`/api/store/inventory/export?format=xlsx&ids=${selectedItems.map((item) => item.id).join(",")}`} className="link font-semibold">Exportar Excel</a>
          <button type="button" className={buttonClasses({ variant: "quiet", className: "ml-auto" })} onClick={() => setSelected(new Set())}>Quitar selección</button>
        </div>
      ) : null}
      {stockAction ? (
        <StockActionSheet item={stockAction.item} initialType={stockAction.type} onClose={closeStock} onDone={(message) => done(message)} />
      ) : null}
      {bulk?.kind === "price" ? <BulkPriceSheet items={bulkItems} onClose={closeBulk} onDone={(message) => done(message, true)} /> : null}
      {bulk?.kind === "threshold" ? <BulkThresholdSheet items={bulkItems} onClose={closeBulk} onDone={(message) => done(message, true)} /> : null}
      {bulk?.kind === "stock" ? <BulkStockSheet items={bulkItems} onClose={closeBulk} onDone={(message) => done(message, true)} /> : null}
      {bulk?.kind === "hide" ? <BulkHideSheet items={bulkItems} onClose={closeBulk} onDone={(message) => done(message, true)} /> : null}
    </div>
  );
}

function RowButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="link font-semibold disabled:cursor-not-allowed disabled:opacity-50">
      {children}
    </button>
  );
}
