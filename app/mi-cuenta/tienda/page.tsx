import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreDiscoveryLink } from "@/components/discovery/store-discovery-link";
import { StoreAllowanceMeter } from "@/components/store-allowance-meter";
import { StoreInventoryAccess } from "@/components/store-inventory-access";
import { StoreRegistrationForm, type StoreApplication } from "@/components/store-registration-form";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusEntryTag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { assistedCommerceEnabled } from "@/lib/payment-methods";
import { getOpenStoreRequest, getStoreAllowanceDetail } from "@/lib/store-allowance";
import { getInventorySummary } from "@/lib/store-inventory";
import { storeApplicationPrefill } from "@/lib/store-profile";
import { storeStatusEntry } from "@/lib/ui/status";

export const metadata = { title: "Mi tienda" };

export default async function StoreAccountPage() {
  const { user, profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  const db = supabase as unknown as SupabaseClient | null;
  const [{ data: photos }, paymentMethods, allowance, summary, inventoryRequest] = store && db
    ? await Promise.all([
        db.from("store_photos").select("id,image_url,alt_text").eq("store_id", store.id).order("sort_order"),
        db.from("store_payment_methods").select("method", { count: "exact", head: true }).eq("store_id", store.id).in("status", ["approved", "pending_review"]),
        getStoreAllowanceDetail(db),
        getInventorySummary(db),
        getOpenStoreRequest(db, "inventory_access"),
      ])
    : [{ data: [] }, { count: 0 }, null, null, null];
  const inventoryEnabled = Boolean(summary?.inventory_enabled);
  const canWrite = store ? ["pending", "active"].includes(store.status) : false;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={store ? "Mi tienda" : "Solicitud de tienda"}
        title={store ? store.name : "Completa la solicitud de tu negocio"}
        meta={<p className="max-w-[68ch]">La información queda vinculada a esta cuenta. Cada cuenta puede tener una tienda.</p>}
        // shop-04: the owner can see the page as buyers will, before and after it is public.
        actions={store ? <Link href={`/tiendas/${store.slug}`} className={buttonClasses({ variant: "secondary" })}>Ver mi página</Link> : null}
      />
      {store ? <StoreStatus store={store as StoreApplication} /> : null}
      {store && allowance && canWrite ? <StoreAllowanceMeter detail={allowance} inventoryEnabled={inventoryEnabled} /> : null}
      {store && canWrite && summary && !inventoryEnabled ? <StoreInventoryAccess openRequest={inventoryRequest} /> : null}
      {store ? (
        <p className="rounded-panel border border-subtle bg-white p-4 t-ui text-ink-2">
          <Link href="/mi-cuenta/tienda/valores-por-defecto" className="link font-semibold">Valores por defecto</Link>: el estado y el texto que
          repites en cada publicación (garantía, horario, entrega) se llenan solos.
          {assistedCommerceEnabled() ? <> <Link href="/mi-cuenta/tienda/pagos" className="link font-semibold">Pagos</Link>: indica cómo pueden pagarte los compradores.</> : null}
          {/* Feature ideas, selling-tools batch (sell-02, sell-03, run-04, buy-06). */}
          {" "}<Link href="/mi-cuenta/tienda/ofertas/ajustes" className="link font-semibold">Qué recibimos</Link>: compra de usados, consignación, parte de pago e insumos que vendes.
          {/* /Feature ideas, selling-tools batch */}
        </p>
      ) : null}
      {/* discovery batch (docs/feature-ideas/discovery.md): Fabricante o Taller, cambios de regalos */}
      {store && canWrite ? <StoreDiscoveryLink /> : null}
      <StoreRegistrationForm
        store={(store as StoreApplication | null) ?? null}
        photos={photos ?? []}
        defaultEmail={user.email ?? ""}
        prefill={store ? {} : storeApplicationPrefill(user.user_metadata, profile)}
        hasPaymentMethods={(paymentMethods.count ?? 0) > 0}
      />
    </div>
  );
}

function StoreStatus({ store }: { store: StoreApplication }) {
  return <section className="rounded-panel border border-subtle bg-white p-4 text-sm leading-6 text-ink-2"><p className="flex flex-wrap items-center gap-2 font-semibold text-ink">Estado: <StatusEntryTag entry={storeStatusEntry(store.status, store.is_verified)} /></p>{store.rejection_reason ? <p className="mt-2 font-semibold text-danger">Motivo: {store.rejection_reason}</p> : null}<p className="mt-2">{store.status === "active" && store.is_verified ? "Tus publicaciones nuevas aparecen directamente si cumplen las reglas." : "Tus publicaciones nuevas pasan por revisión antes de aparecer."}</p></section>;
}
