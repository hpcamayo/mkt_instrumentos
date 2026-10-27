import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Counter } from "@/components/inventory/counter";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getInventorySummary } from "@/lib/store-inventory";
import { einvoiceAvailable } from "@/lib/einvoice/secret";
import { getLocationStock, getOwnLocations } from "@/lib/store-locations-server";

export const metadata = { title: "Mostrador" };

// Effortless Laria, inventory batch, big-10 (docs/ux-effortless/inventory.md): the store's phone or shop computer as
// the counter. Scan or type a code, adjust quantities, record the sale; sales wait on the device while offline.
export default async function CounterPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const summary = await getInventorySummary(supabase);
  if (!summary?.inventory_enabled) redirect("/mi-cuenta/tienda/inventario");
  // store-locations: the location each sale comes from (run-02) and the comprobante (run-03), when connected.
  const [locations, einvoice] = await Promise.all([getOwnLocations(supabase), supabase.rpc("get_einvoice_settings")]);
  const stock = locations.length ? (await getLocationStock(supabase, store.id, null)) ?? [] : [];
  const locationStock: Record<string, Record<string, number>> = {};
  for (const row of stock) (locationStock[row.location_id] ??= {})[row.item_id] = row.quantity_on_hand;
  const receipts = einvoiceAvailable() && store.is_verified && (einvoice.data as { connected?: boolean } | null)?.connected ? { storeName: store.name } : null;
  return (
    <div className="grid gap-4">
      <Breadcrumbs items={[{ label: "Inventario", href: "/mi-cuenta/tienda/inventario" }, { label: "Mostrador" }]} />
      <PageHeader eyebrow={store.name} title="Mostrador" meta="Registra ventas de tu tienda escaneando o escribiendo el código." />
      {summary.can_write ? (
        <Counter storeId={store.id} storeName={store.name} locations={locations.map(({ id, name, is_primary }) => ({ id, name, is_primary }))} locationStock={locationStock} receipts={receipts} />
      ) : (
        <Notice tone="warning" role="note">Tu tienda no puede registrar cambios de inventario en este momento.</Notice>
      )}
    </div>
  );
}
