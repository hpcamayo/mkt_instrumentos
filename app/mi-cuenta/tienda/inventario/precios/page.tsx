import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CampaignList, NewCampaign } from "@/components/inventory/price-campaigns";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getInventorySummary, getPriceCampaigns } from "@/lib/store-inventory";

export const metadata = { title: "Precios" };

// Effortless Laria, inventory batch, stock-15 (docs/ux-effortless/inventory.md).
export default async function PricesPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const summary = await getInventorySummary(supabase);
  if (!summary?.inventory_enabled) redirect("/mi-cuenta/tienda/inventario");
  const campaigns = await getPriceCampaigns(supabase, 20);

  return (
    <div className="grid gap-6">
      <Breadcrumbs items={[{ label: "Inventario", href: "/mi-cuenta/tienda/inventario" }, { label: "Precios" }]} />
      <PageHeader
        eyebrow={store.name}
        title="Precios"
        meta={<p className="max-w-[68ch]">Cambia precios por categoría o en todo el inventario, revisa cada precio antes de aplicar y vuelve a los anteriores cuando termine la campaña. Las publicaciones vinculadas muestran el precio nuevo.</p>}
      />
      {summary.can_write ? (
        <section aria-labelledby="precios-nuevo" className="grid gap-3">
          <h2 id="precios-nuevo" className="t-section text-ink">Nuevo cambio de precio</h2>
          <NewCampaign />
        </section>
      ) : null}
      <section aria-labelledby="precios-historial" className="grid gap-3">
        <h2 id="precios-historial" className="t-section text-ink">Cambios recientes</h2>
        <CampaignList campaigns={campaigns} canWrite={summary.can_write} />
      </section>
    </div>
  );
}
