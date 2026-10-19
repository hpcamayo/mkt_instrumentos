import Link from "next/link";
import { numbers, type DemandRow } from "@/lib/store-inventory";

// Effortless Laria, inventory batch, stock-08: "Agotados con interés". Out-of-stock SKUs whose publication people still
// save as favorite or contact, most wanted first, so the store knows what to restock first. Counts only, never who.
export function InventoryDemand({ rows }: { rows: DemandRow[] }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="agotados-con-interes" className="border-b border-subtle px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="agotados-con-interes" className="t-ui font-semibold text-ink">Agotados con interés</h2>
        <Link href="/mi-cuenta/tienda/inventario/reponer" className="link t-meta font-semibold">Ver la lista de reposición</Link>
      </div>
      <p className="mt-1 t-meta">Personas que guardaron o consultaron estas publicaciones mientras no tienes stock.</p>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 rounded-control border border-subtle px-3 py-2">
            <span className="min-w-0">
              <Link href={`/mi-cuenta/tienda/inventario/${row.id}`} className="link block truncate font-semibold">{row.listing_title || row.product_name}</Link>
              <span className="block t-meta">SKU {row.merchant_sku}</span>
            </span>
            <span className="shrink-0 text-right t-meta">
              {row.favorites ? <span className="block">{numbers.format(row.favorites)} en favoritos</span> : null}
              {row.contacts_90d ? <span className="block">{numbers.format(row.contacts_90d)} {row.contacts_90d === 1 ? "contacto" : "contactos"} en 90 días</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
