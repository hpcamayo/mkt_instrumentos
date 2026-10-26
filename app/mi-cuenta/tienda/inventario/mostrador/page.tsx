import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Counter } from "@/components/inventory/counter";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getInventorySummary } from "@/lib/store-inventory";

export const metadata = { title: "Mostrador" };

// Effortless Laria, inventory batch, big-10 (docs/ux-effortless/inventory.md): the store's phone or shop computer as
// the counter. Scan or type a code, adjust quantities, record the sale; sales wait on the device while offline.
export default async function CounterPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const summary = await getInventorySummary(supabase);
  if (!summary?.inventory_enabled) redirect("/mi-cuenta/tienda/inventario");
  return (
    <div className="grid gap-4">
      <Breadcrumbs items={[{ label: "Inventario", href: "/mi-cuenta/tienda/inventario" }, { label: "Mostrador" }]} />
      <PageHeader eyebrow={store.name} title="Mostrador" meta="Registra ventas de tu tienda escaneando o escribiendo el código." />
      {summary.can_write ? (
        <Counter storeId={store.id} storeName={store.name} />
      ) : (
        <Notice tone="warning" role="note">Tu tienda no puede registrar cambios de inventario en este momento.</Notice>
      )}
    </div>
  );
}
