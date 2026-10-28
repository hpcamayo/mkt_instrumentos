import { redirect } from "next/navigation";
import { UnderstoodPanel } from "@/components/ai/understood-panel";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ReorderTable, ReorderUpload } from "@/components/inventory/reorder-upload";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { reorderUnderstood, understoodFromParams } from "@/lib/ai/store-question";
import { getInventorySummary, getReorderList, numbers } from "@/lib/store-inventory";

export const metadata = { title: "Reposición" };

// Effortless Laria, inventory batch, stock-07 (docs/ux-effortless/inventory.md): what to reorder, as a file for the
// supplier, and the same file back to add what arrived.
export default async function ReorderPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const summary = await getInventorySummary(supabase);
  if (!summary?.inventory_enabled) redirect("/mi-cuenta/tienda/inventario");
  const rows = await getReorderList(supabase);
  // stock-24: opened from "Pregúntale a tu tienda".
  const understood = understoodFromParams((await searchParams) ?? {});

  return (
    <div className="grid gap-6">
      <Breadcrumbs items={[{ label: "Inventario", href: "/mi-cuenta/tienda/inventario" }, { label: "Reposición" }]} />
      <PageHeader
        eyebrow={store.name}
        title="Reposición"
        meta={<p className="max-w-[68ch]">SKU agotados o en su aviso de stock bajo, con lo vendido en 30 días y una cantidad sugerida. Descarga la lista, envíala a tu proveedor y, cuando llegue la mercadería, sube el mismo archivo con lo recibido.</p>}
      />
      {understood ? <UnderstoodPanel understood={reorderUnderstood(understood.gaps)} className="rounded-panel border border-subtle" /> : null}
      <section aria-labelledby="reponer-lista" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="reponer-lista" className="t-section text-ink">{rows ? `Por reponer (${numbers.format(rows.length)})` : "Por reponer"}</h2>
          {rows?.length ? (
            <div className="flex flex-wrap gap-2">
              <a href="/api/store/inventory/reorder?format=xlsx" className={buttonClasses({ variant: "secondary", size: "sm" })}>Descargar Excel</a>
              <a href="/api/store/inventory/reorder?format=csv" className={buttonClasses({ variant: "secondary", size: "sm" })}>Descargar CSV</a>
            </div>
          ) : null}
        </div>
        {rows === null ? (
          <Notice tone="danger" role="alert">No pudimos preparar la lista. Intenta de nuevo en unos minutos.</Notice>
        ) : rows.length ? (
          <ReorderTable rows={rows} />
        ) : (
          <p className="t-body text-ink-2">Nada por reponer: ningún SKU activo está agotado ni en su aviso de stock bajo.</p>
        )}
        <p className="t-meta">Sugerida = lo que falta para cubrir las ventas de 30 días o superar el aviso, lo que sea mayor. Es una guía; cambia la cantidad que quieras pedir.</p>
      </section>
      {summary.can_write ? (
        <section aria-labelledby="reponer-recibido" className="grid gap-3">
          <h2 id="reponer-recibido" className="t-section text-ink">Registrar lo que llegó</h2>
          <ReorderUpload />
        </section>
      ) : null}
    </div>
  );
}
