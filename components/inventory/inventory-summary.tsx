import Link from "next/link";
import { ACTOR_LABELS, MOVEMENT_LABELS, formatDateTime, numbers, signed, type InventorySummary } from "@/lib/store-inventory";
import { cn } from "@/lib/utils";

// Summary tiles (design §13.1, §5.5). Each count opens the table filtered to it. Sales are the store's own records,
// labelled as such: never revenue or sales verified by Laria (brief §8).
export function InventorySummaryTiles({ summary, importErrors }: { summary: InventorySummary; importErrors?: number | null }) {
  const tiles: { label: string; value: number; href?: string; note?: string; attention?: boolean }[] = [
    { label: "SKU activos", value: summary.skus, href: "/mi-cuenta/tienda/inventario", note: summary.archived ? `${numbers.format(summary.archived)} archivados` : undefined },
    { label: "Publicadas", value: summary.published, href: "/mi-cuenta/tienda/inventario?publicacion=published", note: summary.unlinked ? `${numbers.format(summary.unlinked)} SKU sin publicación` : undefined },
    { label: "Unidades en tienda", value: summary.units, note: summary.available_units !== summary.units ? `${numbers.format(summary.available_units)} disponibles` : undefined },
    { label: "Stock bajo", value: summary.low_stock, href: "/mi-cuenta/tienda/inventario?stock=low", attention: summary.low_stock > 0 },
    { label: "Agotados", value: summary.out_of_stock, href: "/mi-cuenta/tienda/inventario?stock=out", attention: summary.out_of_stock > 0 },
    { label: "En revisión", value: summary.in_review, href: "/mi-cuenta/tienda/inventario?publicacion=pending", note: summary.rejected ? `${numbers.format(summary.rejected)} rechazadas` : undefined, attention: summary.rejected > 0 },
    { label: "Ventas registradas por la tienda", value: summary.sales_30d_units, note: `Unidades, últimos 30 días. Anotadas por tu tienda; Laria no las verifica.` },
  ];
  // Import errors arrive with the spreadsheet import (STORE-2); until then the tile is omitted rather than shown as 0.
  if (typeof importErrors === "number") {
    tiles.push({ label: "Errores de importación", value: importErrors, attention: importErrors > 0 });
  }
  return (
    <section aria-labelledby="resumen-inventario" className="border-b border-subtle p-4 md:p-5">
      <h2 id="resumen-inventario" className="sr-only">Resumen del inventario</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cn("flex min-h-24 flex-col gap-1 rounded-panel border p-3", tile.attention ? "border-line-strong bg-warning-tint" : "border-subtle bg-surface")}>
            <dt className="t-meta font-semibold text-ink-2">{tile.label}</dt>
            <dd className="t-section tabular-nums text-ink">
              {tile.href ? <Link href={tile.href} className="link" aria-label={`${tile.label}: ${numbers.format(tile.value)}. Ver en la tabla`}>{numbers.format(tile.value)}</Link> : numbers.format(tile.value)}
            </dd>
            {tile.note ? <dd className="t-meta">{tile.note}</dd> : null}
          </div>
        ))}
      </dl>
      {summary.recent_movements.length ? (
        <div className="mt-4">
          <h3 className="t-ui font-semibold text-ink">Movimientos recientes</h3>
          <ul className="mt-2 divide-y divide-subtle t-ui">
            {summary.recent_movements.map((movement) => (
              <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <Link href={`/mi-cuenta/tienda/inventario/${movement.item_id}`} className="link min-w-0 font-semibold">{movement.merchant_sku} · {movement.product_name}</Link>
                <span className="t-meta">
                  {MOVEMENT_LABELS[movement.movement_type] ?? movement.movement_type} {signed(movement.on_hand_delta)} · queda {numbers.format(movement.on_hand_after)} · {ACTOR_LABELS[movement.actor_kind] ?? movement.actor_kind} · {formatDateTime(movement.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
