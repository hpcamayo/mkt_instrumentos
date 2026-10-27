import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LocationStockUpload } from "@/components/store-locations/location-stock-upload";
import { LocationsManager } from "@/components/store-locations/locations-manager";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getInventorySummary } from "@/lib/store-inventory";
import { getOwnLocations } from "@/lib/store-locations-server";

export const metadata = { title: "Sedes" };

// store-locations, run-02 (docs/feature-ideas/store-locations.md): a store with several shops keeps its stock per
// location. Sedes go with Inventario, because stock per location is stock.
export default async function StoreLocationsPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const summary = await getInventorySummary(supabase);
  const locations = summary?.inventory_enabled ? await getOwnLocations(supabase) : [];

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <Breadcrumbs items={[{ label: "Mi tienda", href: "/mi-cuenta/tienda" }, { label: "Sedes" }]} />
      <PageHeader
        eyebrow={store.name}
        title="Sedes"
        meta={<p className="max-w-[68ch]">Si tienes más de un local, lleva el stock de cada uno. Tus publicaciones dicen en qué sedes hay unidades (“Disponible en Miraflores y Centro”), quien compra elige dónde recoger y el Mostrador vende desde la sede donde estás. Nunca mostramos cuántas unidades hay.</p>}
      />
      {!summary?.inventory_enabled ? (
        <Notice tone="info" role="note">Las sedes se usan con Inventario. Cuando Laria habilite Inventario para tu tienda podrás agregarlas aquí.</Notice>
      ) : (
        <>
          <LocationsManager locations={locations} writable={summary.can_write} />
          {locations.length >= 2 ? <LocationStockUpload locations={locations} /> : null}
          {locations.length ? (
            <p className="t-meta max-w-[68ch]">
              Una venta o un ajuste sin sede (por ejemplo desde Inventario, una importación o una solicitud de compra) descuenta primero de la sede principal y luego de las demás, en este orden; un ingreso sin sede va a la principal. Para mover unidades entre sedes, abre el SKU en Inventario.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
