import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EinvoiceSettingsForm, type EinvoiceSettings } from "@/components/einvoice/einvoice-settings-form";
import { ReceiptsList } from "@/components/einvoice/receipts-list";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import type { ReceiptRecord } from "@/lib/einvoice/nubefact";
import { einvoiceAvailable } from "@/lib/einvoice/secret";
import { getInventorySummary } from "@/lib/store-inventory";

export const metadata = { title: "Comprobantes" };

// store-locations, run-03 (docs/feature-ideas/store-locations.md): boletas and facturas issued from Mostrador through
// the store's own Nubefact account, and the connection itself.
export default async function ReceiptsPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const db = supabase as unknown as SupabaseClient;
  const summary = await getInventorySummary(supabase);
  const available = einvoiceAvailable();
  const [{ data: settings }, { data: receipts }] = await Promise.all([
    db.rpc("get_einvoice_settings"),
    db.from("store_receipts").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const connected = Boolean((settings as EinvoiceSettings | null)?.connected);

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <Breadcrumbs items={[{ label: "Inventario", href: "/mi-cuenta/tienda/inventario" }, { label: "Comprobantes" }]} />
      <PageHeader
        eyebrow={store.name}
        title="Comprobantes"
        meta={<p className="max-w-[68ch]">Emite la boleta o la factura de una venta del Mostrador en el mismo paso, con tu propia cuenta de Nubefact. Tu tienda es quien emite el comprobante ante SUNAT; Laria no cobra ni maneja dinero.</p>}
      />
      {!available ? (
        <Notice tone="info" role="note">La boleta electrónica aún no está disponible en Laria. Te avisaremos cuando puedas conectar tu cuenta.</Notice>
      ) : !store.is_verified || !summary?.inventory_enabled ? (
        <Notice tone="info" role="note">La boleta electrónica es para tiendas verificadas con Inventario habilitado.</Notice>
      ) : (
        <EinvoiceSettingsForm settings={(settings as EinvoiceSettings | null) ?? { connected: false }} />
      )}
      {connected || (receipts ?? []).length ? (
        <section aria-labelledby="comprobantes-titulo" className="grid gap-3">
          <h2 id="comprobantes-titulo" className="t-section text-ink">Emitidos</h2>
          <ReceiptsList receipts={(receipts ?? []) as ReceiptRecord[]} today={today} />
        </section>
      ) : null}
    </div>
  );
}
